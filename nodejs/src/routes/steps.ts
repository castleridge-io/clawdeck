import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { createStepService } from '../services/step.service.js'
import { createRunService } from '../services/run.service.js'
import type { Step, Run, Story, Prisma } from '@prisma/client'

// JSON Schema for validation
const stepStatusSchema = {
  type: 'string',
  enum: ['waiting', 'running', 'completed', 'failed', 'awaiting_approval'],
} as const

const claimBodySchema = {
  type: 'object',
  properties: {
    agent_id: { type: 'string' },
  },
  required: ['agent_id'],
  additionalProperties: false,
} as const

const completeBodySchema = {
  type: 'object',
  properties: {
    output: {},
  },
  required: ['output'],
  additionalProperties: false,
} as const

const failBodySchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    output: {},
  },
  additionalProperties: false,
} as const

const patchBodySchema = {
  type: 'object',
  properties: {
    status: stepStatusSchema,
    output: {},
    current_story_id: { type: ['string', 'null'] },
  },
  anyOf: [{ required: ['status'] }, { required: ['output'] }, { required: ['current_story_id'] }],
  additionalProperties: false,
} as const

// Helper to safely parse JSON (prevents crashes from invalid JSON in DB)
function safeJsonParse(str: string | null): unknown | null {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return str // Return as-is if not valid JSON
  }
}

// Helper function to convert step to JSON response
function stepToJson(step: Step): StepJson {
  return {
    id: step.id,
    run_id: step.runId,
    step_id: step.stepId,
    agent_id: step.agentId,
    step_index: step.stepIndex,
    input_template: step.inputTemplate,
    expects: step.expects,
    status: step.status,
    output: safeJsonParse(step.output),
    retry_count: step.retryCount,
    max_retries: step.maxRetries,
    type: step.type,
    loop_config: safeJsonParse(step.loopConfig),
    current_story_id: step.currentStoryId,
    created_at: step.createdAt.toISOString(),
    updated_at: step.updatedAt.toISOString(),
  }
}

interface StepJson {
  id: string
  run_id: string
  step_id: string
  agent_id: string | null
  step_index: number
  input_template: string
  expects: string
  status: string
  output: unknown
  retry_count: number
  max_retries: number
  type: string
  loop_config: unknown
  current_story_id: string | null
  created_at: string
  updated_at: string
}

export async function stepsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const stepService = createStepService()
  const runService = createRunService()

  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/runs/:runId/steps - List steps for a run
  fastify.get('/', async (request, reply) => {
    const { runId } = request.params

    const run = await runService.getRun(runId)
    if (!run) {
      return reply.code(404).send({ error: 'Run not found' })
    }

    const steps = await stepService.listStepsByRunId(runId)

    return {
      success: true,
      data: steps.map(stepToJson),
    }
  })

  // GET /api/v1/runs/:runId/steps/pending - Get next pending step for a run
  fastify.get('/pending', async (request, reply) => {
    const { runId } = request.params

    const run = await runService.getRun(runId)
    if (!run) {
      return reply.code(404).send({ error: 'Run not found' })
    }

    const step = await stepService.getNextPendingStep(runId)

    if (!step) {
      return {
        success: true,
        data: null,
        message: 'No pending steps',
      }
    }

    return {
      success: true,
      data: stepToJson(step),
    }
  })

  // GET /api/v1/runs/:runId/steps/:stepId - Get single step
  fastify.get('/:stepId', async (request, reply) => {
    const { runId, stepId } = request.params

    const step = await stepService.getStep(stepId)

    if (!step || step.runId !== runId) {
      return reply.code(404).send({ error: 'Step not found' })
    }

    return {
      success: true,
      data: stepToJson(step),
    }
  })

  // POST /api/v1/runs/:runId/steps/:stepId/claim - Claim a step (agent starts work)
  fastify.post(
    '/:stepId/claim',
    {
      schema: {
        body: claimBodySchema,
      },
    },
    async (request, reply) => {
      const { runId, stepId } = request.params
      const agentId = request.headers['x-agent-name'] || request.body?.agent_id

      if (!agentId) {
        return reply.code(400).send({ error: 'agent_id or X-Agent-Name header is required' })
      }

      // First verify run exists and is in running status
      const run = await runService.getRun(runId)
      if (!run) {
        return reply.code(404).send({ error: 'Run not found' })
      }

      if (run.status !== 'running') {
        return reply.code(400).send({
          error: `Cannot claim step. Run status is '${run.status}', not 'running'`,
          run_status: run.status,
        })
      }

      // Verify step exists and belongs to this run
      const step = await stepService.getStep(stepId)

      if (!step || step.runId !== runId) {
        return reply.code(404).send({ error: 'Step not found' })
      }

      // Verify agent matches
      if (step.agentId && step.agentId !== agentId) {
        return reply.code(403).send({
          error: `Step is assigned to agent '${step.agentId}', not '${agentId}'`,
        })
      }

      // Verify all previous steps are completed (step ordering enforcement)
      const previousSteps = await stepService.listStepsByRunId(runId)
      const incompletePreviousSteps = previousSteps.filter(
        (s) => s.stepIndex < step.stepIndex && s.status !== 'completed'
      )

      if (incompletePreviousSteps.length > 0) {
        return reply.code(400).send({
          error: 'Previous steps not completed. Complete them before claiming this step.',
          pending_steps: incompletePreviousSteps.map((s) => s.stepId),
        })
      }

      // Use atomic claim to prevent race conditions
      const claimedStep = await stepService.claimStep(stepId, agentId)

      if (!claimedStep) {
        // Step was already claimed by another agent
        const currentStep = await stepService.getStep(stepId)
        return reply.code(409).send({
          error: `Step cannot be claimed. Current status: ${currentStep.status}`,
          current_status: currentStep.status,
        })
      }

      return {
        success: true,
        data: stepToJson(claimedStep),
        message: `Step claimed by ${agentId}`,
      }
    }
  )

  // POST /api/v1/runs/:runId/steps/:stepId/complete - Complete a step
  fastify.post(
    '/:stepId/complete',
    {
      schema: {
        body: completeBodySchema,
      },
    },
    async (request, reply) => {
      const { runId, stepId } = request.params
      const { output } = request.body as { output: unknown }

      const step = await stepService.getStep(stepId)

      if (!step || step.runId !== runId) {
        return reply.code(404).send({ error: 'Step not found' })
      }

      if (step.status !== 'running') {
        return reply.code(400).send({
          error: `Step cannot be completed. Current status: ${step.status}`,
          current_status: step.status,
        })
      }

      try {
        // Use transactional method to ensure atomicity
        const result = await stepService.completeStepWithRunUpdate(stepId, output)

        return {
          success: true,
          data: stepToJson(result.step),
          run_completed: result.runCompleted,
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('P2025')) {
          return reply.code(404).send({ error: 'Step not found' })
        }
        throw error
      }
    }
  )

  // POST /api/v1/runs/:runId/steps/:stepId/fail - Fail a step (with retry)
  fastify.post(
    '/:stepId/fail',
    {
      schema: {
        body: failBodySchema,
      },
    },
    async (request, reply) => {
      const { runId, stepId } = request.params
      const { error: errorMessage, output } = request.body as {
        error: string
        output?: unknown
      }

      const step = await stepService.getStep(stepId)

      if (!step || step.runId !== runId) {
        return reply.code(404).send({ error: 'Step not found' })
      }

      if (step.status !== 'running') {
        return reply.code(400).send({
          error: `Step cannot be failed. Current status: ${step.status}`,
          current_status: step.status,
        })
      }

      try {
        // Check if we can retry
        if (step.retryCount < step.maxRetries) {
          await stepService.incrementStepRetry(stepId)
          const updatedStep = await stepService.updateStepStatus(stepId, 'waiting', {
            error: errorMessage,
            output,
            retry: step.retryCount + 1,
          })

          return {
            success: true,
            data: stepToJson(updatedStep),
            message: `Step failed, will retry (${step.retryCount + 1}/${step.maxRetries})`,
            will_retry: true,
          }
        } else {
          // Max retries exceeded, mark as failed
          const updatedStep = await stepService.updateStepStatus(stepId, 'failed', {
            error: errorMessage,
            output,
            retries_exceeded: true,
          })

          // Update run status to failed
          await runService.updateRunStatus(runId, 'failed')

          return {
            success: true,
            data: stepToJson(updatedStep),
            message: 'Step failed, max retries exceeded',
            will_retry: false,
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({ error: error.message })
        }
        throw error
      }
    }
  )

  // PATCH /api/v1/runs/:runId/steps/:stepId - Update step (for approval steps and loop steps)
  fastify.patch(
    '/:stepId',
    {
      schema: {
        body: patchBodySchema,
      },
    },
    async (request, reply) => {
      const { runId, stepId } = request.params
      const { status, output, current_story_id } = request.body as {
        status?: string
        output?: unknown
        current_story_id?: string | null
      }

      const step = await stepService.getStep(stepId)

      if (!step || step.runId !== runId) {
        return reply.code(404).send({ error: 'Step not found' })
      }

      try {
        const updatedStep = await stepService.updateStep(stepId, {
          status,
          output,
          currentStoryId: current_story_id,
        })

        return {
          success: true,
          data: stepToJson(updatedStep),
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({ error: error.message })
        }
        if (error instanceof Error && error.message.includes('Invalid status')) {
          return reply.code(400).send({ error: error.message })
        }
        throw error
      }
    }
  })
}
