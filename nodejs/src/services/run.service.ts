import { prisma } from '../db/prisma.js'
import type { Run, Step, Story, Prisma } from '@prisma/client'
import { createWorkflowService, type FormattedWorkflow, type StepConfig } from './workflow.service.js'
import { createStepService, type CreateStepData } from './step.service.js'

const VALID_STATUSES = ['running', 'completed', 'failed'] as const
type RunStatus = typeof VALID_STATUSES[number]

export interface CreateRunData {
  workflowId: string | bigint
  taskId?: string | bigint | null
  task: string
  context?: Record<string, unknown>
  notifyUrl?: string | null
  id?: string
}

export interface ListRunFilters {
  taskId?: string | bigint
  status?: RunStatus
}

interface RunWithRelations extends Run {
  steps: Step[]
  stories: Story[]
}

/**
 * Create run service
 */
export function createRunService () {
  const workflowService = createWorkflowService()
  const stepService = createStepService()

  return {
    /**
     * Create a new run
     */
    async createRun (data: CreateRunData): Promise<Run> {
      const { workflowId, taskId, task, context = {}, notifyUrl } = data

      // Verify workflow exists
      const workflow = await workflowService.getWorkflow(workflowId)
      if (!workflow) {
        throw new Error('Workflow not found')
      }

      // Generate run ID if not provided
      const runId = data.id ?? `run-${Date.now()}-${Math.random().toString(36).substring(7)}`

      // Create the run
      const run = await prisma.run.create({
        data: {
          id: runId,
          workflowId: BigInt(workflowId),
          taskId: taskId?.toString(),
          task,
          status: 'running',
          context: JSON.stringify(context),
          notifyUrl,
        },
      })

      // Create steps from workflow config
      const steps = workflow.steps ?? []
      for (let i = 0; i < steps.length; i++) {
        const stepConfig = steps[i]
        await stepService.createStep({
          runId: run.id,
          stepId: stepConfig.stepId,
          agentId: stepConfig.agentId,
          stepIndex: i,
          inputTemplate: stepConfig.inputTemplate,
          expects: stepConfig.expects,
          type: (stepConfig.type ?? 'single') as 'single' | 'loop' | 'approval',
          loopConfig: stepConfig.loopConfig,
        })
      }

      return run
    },

    /**
     * Get run by ID
     */
    async getRun (id: string): Promise<RunWithRelations | null> {
      return await prisma.run.findUnique({
        where: { id },
        include: {
          steps: {
            orderBy: { stepIndex: 'asc' },
          },
          stories: {
            orderBy: { storyIndex: 'asc' },
          },
        },
      }) as RunWithRelations | null
    },

    /**
     * List all runs
     */
    async listRuns (filters: ListRunFilters = {}): Promise<Run[]> {
      const where: Prisma.RunWhereInput = {}

      if (filters.taskId) {
        where.taskId = filters.taskId.toString()
      }

      if (filters.status) {
        where.status = filters.status
      }

      return await prisma.run.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })
    },

    /**
     * Get runs by task ID
     */
    async getRunsByTaskId (taskId: string | bigint): Promise<Run[]> {
      return await prisma.run.findMany({
        where: { taskId: taskId.toString() },
        orderBy: { createdAt: 'desc' },
      })
    },

    /**
     * Update run status
     */
    async updateRunStatus (id: string, status: RunStatus): Promise<Run> {
      if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`)
      }

      const run = await prisma.run.findUnique({
        where: { id },
      })

      if (!run) {
        throw new Error('Run not found')
      }

      return await prisma.run.update({
        where: { id },
        data: { status },
      })
    },
  }
}

export type { RunStatus }
