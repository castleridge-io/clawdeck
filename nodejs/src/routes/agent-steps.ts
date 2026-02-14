import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { createWorkflowExecutorService } from '../services/workflow-executor.service.js'

const claimByAgentBodySchema = {
  type: 'object',
  properties: {
    agent_id: { type: 'string' },
  },
  required: ['agent_id'],
  additionalProperties: false,
} as const

const completeWithPipelineBodySchema = {
  type: 'object',
  properties: {
    output: { type: 'string' },
  },
  required: ['output'],
  additionalProperties: false,
} as const

export async function agentStepsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const executorService = createWorkflowExecutorService()

  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // POST /api/v1/steps/claim-by-agent - Agent polls for work
  // This is the main endpoint for agents to claim pending steps
  fastify.post(
    '/claim-by-agent',
    {
      schema: {
        body: claimByAgentBodySchema,
      },
    },
    async (request, reply) => {
      const body = request.body as { agent_id: string }
      const agentId = body.agent_id

      // Use workflow executor to find and claim step
      const result = await executorService.claimStepByAgent(agentId)

      if (!result.found) {
        return {
          success: true,
          data: null,
          message: 'No pending steps for this agent',
        }
      }

      return {
        success: true,
        data: {
          step_id: result.stepId,
          run_id: result.runId,
          resolved_input: result.resolvedInput,
          story_id: result.storyId,
        },
        message: 'Step claimed successfully',
      }
    }
  )

  // POST /api/v1/steps/:stepId/complete-with-pipeline - Complete step with context merging
  // This endpoint merges agent output into run context and advances the pipeline
  fastify.post(
    '/:stepId/complete-with-pipeline',
    {
      schema: {
        body: completeWithPipelineBodySchema,
      },
    },
    async (request, reply) => {
      const params = request.params as { stepId: string }
      const { stepId } = params
      const body = request.body as { output: string }

      try {
        const result = await executorService.completeStepWithPipeline(
          stepId,
          body.output
        )

        return {
          success: true,
          data: {
            step_completed: result.stepCompleted,
            run_completed: result.runCompleted,
          },
          message: result.runCompleted
            ? 'Step completed and run finished'
            : 'Step completed',
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({ error: error.message })
        }
        throw error
      }
    }
  )

  // POST /api/v1/steps/cleanup-abandoned - Cleanup stuck steps
  // Admin endpoint to reset steps stuck in running status
  fastify.post('/cleanup-abandoned', async (request, reply) => {
    const query = request.query as { max_age_minutes?: string }
    const maxAgeMinutes = query.max_age_minutes
      ? parseInt(query.max_age_minutes, 10)
      : 15

    const result = await executorService.cleanupAbandonedSteps(maxAgeMinutes)

    return {
      success: true,
      data: {
        cleaned_count: result.cleanedCount,
      },
      message: `Cleaned up ${result.cleanedCount} abandoned steps`,
    }
  })
}
