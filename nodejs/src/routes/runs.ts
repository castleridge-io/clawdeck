import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { createRunService } from '../services/run.service.js'
import type { Run, Step, Story } from '@prisma/client'

interface StepJson {
  id: string
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
}

interface StoryJson {
  id: string
  story_index: number
  story_id: string
  title: string
  description: string
  acceptance_criteria: string
  status: string
  output: unknown
  retry_count: number
  max_retries: number
}

interface RunJson {
  id: string
  workflow_id: string
  task_id: string | null
  task: string
  status: string
  context: unknown
  notify_url: string | null
  awaiting_approval: boolean
  awaiting_approval_since: string | null
  created_at: string
  updated_at: string
  steps: StepJson[]
  stories: StoryJson[]
}

// Helper function to convert run to JSON response
function runToJson(run: Run): RunJson {
  return {
    id: run.id,
    workflow_id: run.workflowId.toString(),
    task_id: run.taskId,
    task: run.task,
    status: run.status,
    context: run.context ? JSON.parse(run.context) : {},
    notify_url: run.notifyUrl,
    awaiting_approval: run.awaitingApproval,
    awaiting_approval_since: run.awaitingApprovalSince,
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
    steps:
      run.steps?.map((step: Step) => ({
        id: step.id,
        step_id: step.stepId,
        agent_id: step.agentId,
        step_index: step.stepIndex,
        input_template: step.inputTemplate,
        expects: step.expects,
        status: step.status,
        output: step.output ? JSON.parse(step.output) : null,
        retry_count: step.retryCount,
        max_retries: step.maxRetries,
        type: step.type,
        loop_config: step.loopConfig ? JSON.parse(step.loopConfig) : null,
        current_story_id: step.currentStoryId,
      })) || [],
    stories:
      run.stories?.map((story: Story) => ({
        id: story.id,
        story_index: story.storyIndex,
        story_id: story.storyId,
        title: story.title,
        description: story.description,
        acceptance_criteria: story.acceptanceCriteria,
        status: story.status,
        output: story.output ? JSON.parse(story.output) : null,
        retry_count: story.retryCount,
        max_retries: story.maxRetries,
      })) || [],
  }
}

interface RunFilters {
  task_id?: string
  status?: string
}

export async function runsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const runService = createRunService()

  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/runs - List runs
  fastify.get('/', async (request, reply) => {
    const { task_id, status } = request.query

    const filters: RunFilters = {}
    if (task_id) {
      filters.taskId = task_id
    }
    if (status) {
      filters.status = status
    }

    const runs = await runService.listRuns(filters)

    return {
      success: true,
      data: runs.map((run) => ({
        id: run.id,
        workflow_id: run.workflowId.toString(),
        task_id: run.taskId,
        task: run.task,
        status: run.status,
        created_at: run.createdAt.toISOString(),
        updated_at: run.updatedAt.toISOString(),
      })),
    }
  })

  // GET /api/v1/runs/:id - Get single run
  fastify.get('/:id', async (request, reply) => {
    const run = await runService.getRun(request.params.id)

    if (!run) {
      return reply.code(404).send({ error: 'Run not found' })
    }

    return {
      success: true,
      data: runToJson(run),
    }
  })

  // POST /api/v1/runs - Create run
  fastify.post('/', async (request, reply) => {
    const { workflow_id, task_id, task, context, notify_url } = request.body as {
      workflow_id?: string
      task_id?: string
      task?: string
      context?: unknown
      notify_url?: string
    }

    if (!workflow_id) {
      return reply.code(400).send({ error: 'workflow_id is required' })
    }

    if (!task) {
      return reply.code(400).send({ error: 'task is required' })
    }

    try {
      const run = await runService.createRun({
        workflowId: workflow_id,
        taskId: task_id,
        task,
        context,
        notifyUrl: notify_url,
      })

      return reply.code(201).send({
        success: true,
        data: runToJson(run),
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // PATCH /api/v1/runs/:id/status - Update run status
  fastify.patch('/:id/status', async (request, reply) => {
    const { status } = request.body as { status?: string }

    if (!status) {
      return reply.code(400).send({ error: 'status is required' })
    }

    try {
      const run = await runService.updateRunStatus(request.params.id, status)

      return {
        success: true,
        data: runToJson(run),
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
  })
}
