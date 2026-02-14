import type { Step, Prisma } from '@prisma/client'

const VALID_STATUSES = ['pending', 'running', 'completed', 'failed', 'awaiting_approval'] as const
type StepStatus = typeof VALID_STATUSES[number]

const VALID_TYPES = ['single', 'loop', 'approval'] as const

// Valid status transitions: key = current status, value = allowed next statuses
const VALID_TRANSITIONS: Record<string, string[]> = {
  waiting: ['running', 'awaiting_approval'],
  pending: ['running', 'awaiting_approval'],
  running: ['completed', 'failed', 'awaiting_approval', 'waiting'],
  awaiting_approval: ['running', 'completed', 'failed'],
  completed: [], // Terminal state
  failed: [], // Terminal state
}

export function createStepService() {
  return {
    /**
     * Create a new step
     */
    async createStep(data: {
      runId: string
      stepId?: string
      agentId?: string
      stepIndex: number
      inputTemplate?: string
      expects?: string
      type: 'single' | 'loop' | 'approval'
      loopConfig?: unknown
      maxRetries?: number
    }): Promise<Step> {
      const prisma = (await import('../db/prisma.js')).prisma

      // Verify run exists
      const run = await prisma.run.findUnique({
        where: { id: data.runId },
      })

      if (!run) {
        throw new Error('Run not found')
      }

      // Generate step ID
      const id = `step-${Date.now()}-${Math.random().toString(36).substring(7)}`

      return await prisma.step.create({
        data: {
          id,
          runId: data.runId,
          stepId: data.stepId ?? '',
          agentId: data.agentId ?? '',
          stepIndex: data.stepIndex,
          inputTemplate: data.inputTemplate ?? '',
          expects: data.expects ?? '',
          type: data.type,
          loopConfig: data.loopConfig ? JSON.stringify(data.loopConfig) : null,
          maxRetries: data.maxRetries ?? 3,
          status: 'pending',
        },
      })
    },

    /**
     * Get step by ID
     */
    async getStep(id: string): Promise<Step | null> {
      const prisma = (await import('../db/prisma.js')).prisma

      return await prisma.step.findUnique({
        where: { id },
      })
    },

    /**
     * List steps by run ID
     */
    async listStepsByRunId(runId: string): Promise<Step[]> {
      const prisma = (await import('../db/prisma.js')).prisma

      return await prisma.step.findMany({
        where: { runId: runId },
        orderBy: { stepIndex: 'asc' },
      })
    },

    /**
     * Get next pending step for a run
     */
    async getNextPendingStep(runId: string): Promise<Step | null> {
      const prisma = (await import('../db/prisma.js')).prisma

      return await prisma.step.findFirst({
        where: {
          runId: runId,
          status: 'pending',
        },
        orderBy: { stepIndex: 'asc' },
      })
    },

    /**
     * Claim a step (atomic operation to prevent race conditions)
     */
    async claimStep(stepId: string, agentId: string | string[]): Promise<Step | null> {
      const prisma = (await import('../db/prisma.js')).prisma
      const agentIdStr = typeof agentId === 'string' ? agentId : agentId[0]

      // Use updateMany with status check for atomic claim
      const result = await prisma.step.updateMany({
        where: {
          id: stepId,
          status: 'pending',
        },
        data: {
          status: 'running',
          agentId: agentIdStr,
        },
      })

      if (result.count === 0) {
        return null
      }

      return await prisma.step.findUnique({
        where: { id: stepId },
      })
    },

    /**
     * Complete a step and optionally update run status
     */
    async completeStepWithRunUpdate(stepId: string, output: unknown): Promise<{ step: Step; runCompleted: boolean }> {
      const prisma = (await import('../db/prisma.js')).prisma

      const step = await prisma.step.findUnique({
        where: { id: stepId },
      })

      if (!step) {
        throw new Error('Step not found')
      }

      const updatedStep = await prisma.step.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          output: typeof output === 'string' ? output : JSON.stringify(output),
        },
      })

      // Check if all steps are completed
      const pendingSteps = await prisma.step.count({
        where: {
          runId: step.runId,
          status: { notIn: ['completed', 'failed'] },
        },
      })

      let runCompleted = false
      if (pendingSteps === 0) {
        await prisma.run.update({
          where: { id: step.runId },
          data: { status: 'completed' },
        })
        runCompleted = true
      }

      return { step: updatedStep, runCompleted }
    },

    /**
     * Update step status
     */
    async updateStepStatus(
      id: string,
      status: StepStatus,
      output?: unknown,
    ): Promise<Step> {
      const prisma = (await import('../db/prisma.js')).prisma

      const step = await prisma.step.findUnique({
        where: { id },
      })

      if (!step) {
        throw new Error('Step not found')
      }

      // Validate status transition (skip if same status)
      if (step.status !== status && !isValidTransition(step.status, status)) {
        throw new Error(`Invalid status transition: ${step.status} → ${status}`)
      }

      const updateData: Prisma.StepUpdateInput = { status }
      if (output !== undefined) {
        updateData.output = typeof output === 'string' ? output : JSON.stringify(output)
      }

      return await prisma.step.update({
        where: { id },
        data: updateData,
      })
    },

    /**
     * Update step fields (for current_story_id and other optional fields)
     */
    async updateStep(
      id: string,
      data: {
        status?: string
        output?: unknown
        currentStoryId?: string | null
      },
    ): Promise<Step> {
      const prisma = (await import('../db/prisma.js')).prisma

      const step = await prisma.step.findUnique({
        where: { id },
      })

      if (!step) {
        throw new Error('Step not found')
      }

      const updateData: Prisma.StepUpdateInput = {}

      if (data.status !== undefined) {
        if (!VALID_STATUSES.includes(data.status as StepStatus)) {
          throw new Error(
            `Invalid status: ${data.status}. Must be one of: ${VALID_STATUSES.join(', ')}`
          )
        }
        updateData.status = data.status
      }

      if (data.output !== undefined) {
        updateData.output = typeof data.output === 'string' ? data.output : JSON.stringify(data.output)
      }

      if (data.currentStoryId !== undefined) {
        updateData.currentStoryId = data.currentStoryId
      }

      return await prisma.step.update({
        where: { id },
        data: updateData,
      })
    },

    /**
     * Increment step retry count
     */
    async incrementStepRetry(id: string): Promise<Step> {
      const prisma = (await import('../db/prisma.js')).prisma

      const step = await prisma.step.findUnique({
        where: { id },
      })

      if (!step) {
        throw new Error('Step not found')
      }

      if (step.retryCount >= step.maxRetries) {
        throw new Error('Maximum retries exceeded')
      }

      return await prisma.step.update({
        where: { id },
        data: {
          retryCount: step.retryCount + 1,
        },
      })
    },
  }
}

export type CreateStepData = Parameters<ReturnType<typeof createStepService>['createStep']>[0]

/**
 * Validate status transition
 */
function isValidTransition(currentStatus: string, newStatus: string): boolean {
  const allowedTransitions = VALID_TRANSITIONS[currentStatus]
  return allowedTransitions && allowedTransitions.includes(newStatus)
}
