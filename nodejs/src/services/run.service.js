import { prisma } from '../db/prisma.js'
import { createWorkflowService } from './workflow.service.js'
import { createStepService } from './step.service.js'

const VALID_STATUSES = ['running', 'completed', 'failed']

/**
 * Create run service
 */
export function createRunService() {
  const workflowService = createWorkflowService()
  const stepService = createStepService()

  return {
    /**
     * Create a new run
     */
    async createRun(data) {
      const { workflowId, taskId, task, context = {}, notifyUrl } = data

      // Verify workflow exists
      const workflow = await workflowService.getWorkflow(workflowId)
      if (!workflow) {
        throw new Error('Workflow not found')
      }

      // Generate run ID if not provided
      const runId = data.id || `run-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Create the run
      const run = await prisma.run.create({
        data: {
          id: runId,
          workflowId: BigInt(workflowId),
          taskId: taskId?.toString(),
          task,
          status: 'running',
          context: JSON.stringify(context),
          notifyUrl
        }
      })

      // Create steps from workflow config
      const steps = workflow.config.steps || []
      for (let i = 0; i < steps.length; i++) {
        const stepConfig = steps[i]
        await stepService.createStep({
          runId: run.id,
          stepId: stepConfig.stepId,
          agentId: stepConfig.agentId,
          stepIndex: i,
          inputTemplate: stepConfig.inputTemplate,
          expects: stepConfig.expects,
          type: stepConfig.type,
          loopConfig: stepConfig.loopConfig
        })
      }

      return run
    },

    /**
     * Get run by ID
     */
    async getRun(id) {
      return await prisma.run.findUnique({
        where: { id },
        include: {
          steps: {
            orderBy: { stepIndex: 'asc' }
          },
          stories: {
            orderBy: { storyIndex: 'asc' }
          }
        }
      })
    },

    /**
     * List all runs
     */
    async listRuns(filters = {}) {
      const where = {}

      if (filters.taskId) {
        where.taskId = filters.taskId
      }

      if (filters.status) {
        where.status = filters.status
      }

      return await prisma.run.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      })
    },

    /**
     * Get runs by task ID
     */
    async getRunsByTaskId(taskId) {
      return await prisma.run.findMany({
        where: { taskId: taskId.toString() },
        orderBy: { createdAt: 'desc' }
      })
    },

    /**
     * Update run status
     */
    async updateRunStatus(id, status) {
      if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`)
      }

      const run = await prisma.run.findUnique({
        where: { id }
      })

      if (!run) {
        throw new Error('Run not found')
      }

      return await prisma.run.update({
        where: { id },
        data: { status }
      })
    }
  }
}
