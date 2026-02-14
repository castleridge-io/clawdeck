import type { Prisma } from '@prisma/client'

const VALID_STATUSES = ['pending', 'running', 'completed', 'failed', 'awaiting_approval'] as const
const VALID_TYPES = ['single', 'loop', 'approval'] as const

// Valid status transitions: key = current status, value = allowed next statuses
const VALID_TRANSITIONS: Record<string, string[]> = {
  waiting: ['running', 'awaiting_approval'],
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
    }): Promise<{ id: string; runId: string; stepId: string; stepIndex: number }> {
      const prisma = (await import('../db/prisma.js')).prisma

      // Verify run exists
      const run = await prisma.run.findUnique({
        where: { id: BigInt(runId) },
      })

      if (!run) {
        throw new Error('Run not found')
      }

      // Generate step ID
      const id = `step-${Date.now()}-${Math.random().toString(36).substring(7)}`

      return await prisma.step.create({
        data: {
          id,
          runId,
          stepId,
          agentId,
          stepIndex,
          inputTemplate,
          expects,
          type,
          loopConfig: loopConfig ? JSON.stringify(loopConfig) : null,
          maxRetries: maxRetries ?? 3,
          status: 'pending',
        },
      })
    },

    /**
     * Get step by ID
     */
    async getStep(id: string): Promise<{ id: string; runId: string; stepId: string; stepIndex: number; agentId: string | null; inputTemplate: string; expects: string; type: string; loopConfig: unknown; maxRetries: number; status: string; currentStoryId: string | null } | null> {
      const prisma = (await import('../db/prisma.js')).prisma

      const step = await prisma.step.findUnique({
        where: { id },
      })

      if (!step) {
        throw new Error('Step not found')
      }

      return step
    },

    /**
     * List steps by run ID
     */
    async listStepsByRunId(runId: string): Promise<Array<{ id: string; runId: string; stepId: string; stepIndex: number; agentId: string | null; inputTemplate: string; expects: string; type: string; loopConfig: unknown; maxRetries: number; status: string; currentStoryId: string | null }>> {
      const prisma = (await import('../db/prisma.js')).prisma

      return await prisma.step.findMany({
        where: { runId: BigInt(runId) },
        orderBy: { stepIndex: 'asc' },
      })
    },

    /**
     * Update step status
     */
    async updateStepStatus(
      id: string,
      status: string,
      output?: unknown,
    ): Promise<{ id: string; runId: string; stepId: string; stepIndex: number; agentId: string | null; inputTemplate: string; expects: string; type: string; loopConfig: unknown; maxRetries: number; status: string; currentStoryId: string | null }> {
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

      const updateData: Record<string, unknown> = { status }
      if (output !== undefined) {
        updateData.output = typeof output === 'string' ? output : JSON.stringify(output)
      }

      const updatedStep = await prisma.step.update({
        where: { id },
        data: updateData,
      })

      return updatedStep
    },

    /**
     * Update step fields (for current_story_id and other optional fields)
     */
    async updateStep(
      id: string,
      data: {
        status?: string
        output?: unknown
        currentStoryId?: string
      },
    ): Promise<{ id: string; runId: string; stepId: string; stepIndex: number; agentId: string | null; inputTemplate: string; expects: string; type: string; loopConfig: unknown; maxRetries: number; status: string; currentStoryId: string | null }> {
      const prisma = (await import('../db/prisma.js')).prisma

      const step = await prisma.step.findUnique({
        where: { id },
      })

      if (!step) {
        throw new Error('Step not found')
      }

      const updateData: Record<string, unknown> = {}

      if (data.status !== undefined) {
        if (!VALID_STATUSES.includes(data.status)) {
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

      const updatedStep = await prisma.step.update({
        where: { id },
        data: updateData,
      })

      return updatedStep
    },

    /**
     * Increment step retry count
     */
    async incrementStepRetry(id: string): Promise<{ id: string; runId: string; stepId: string; stepIndex: number; agentId: string | null; inputTemplate: string; expects: string; type: string; loopConfig: unknown; maxRetries: number; status: string; currentStoryId: string | null } | null> {
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

      const updatedStep = await prisma.step.update({
        where: { id },
        data: {
          retryCount: step.retryCount + 1,
        },
      })

      return updatedStep
    },
  }
}

/**
 * Validate status transition
 */
function isValidTransition(currentStatus: string, newStatus: string): boolean {
  const allowedTransitions = VALID_TRANSITIONS[currentStatus]
  return allowedTransitions && allowedTransitions.includes(newStatus)
}
