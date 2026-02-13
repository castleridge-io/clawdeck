import { prisma } from '../db/prisma.js'

const VALID_STATUSES = ['waiting', 'running', 'completed', 'failed', 'awaiting_approval']
const VALID_TYPES = ['single', 'loop', 'approval']

/**
 * Create step service
 */
export function createStepService() {
  return {
    /**
     * Create a new step
     */
    async createStep(data) {
      const {
        runId,
        stepId,
        agentId,
        stepIndex,
        inputTemplate,
        expects,
        type = 'single',
        loopConfig,
        maxRetries = 3
      } = data

      // Verify run exists
      const run = await prisma.run.findUnique({
        where: { id: runId }
      })

      if (!run) {
        throw new Error('Run not found')
      }

      if (type && !VALID_TYPES.includes(type)) {
        throw new Error(`Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(', ')}`)
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
          maxRetries
        }
      })
    },

    /**
     * Get step by ID
     */
    async getStep(id) {
      return await prisma.step.findUnique({
        where: { id }
      })
    },

    /**
     * List steps by run ID
     */
    async listStepsByRunId(runId) {
      return await prisma.step.findMany({
        where: { runId },
        orderBy: { stepIndex: 'asc' }
      })
    },

    /**
     * Update step status
     */
    async updateStepStatus(id, status, output = null) {
      if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`)
      }

      const step = await prisma.step.findUnique({
        where: { id }
      })

      if (!step) {
        throw new Error('Step not found')
      }

      const updateData = { status }

      if (output !== null) {
        updateData.output = typeof output === 'string' ? output : JSON.stringify(output)
      }

      return await prisma.step.update({
        where: { id },
        data: updateData
      })
    },

    /**
     * Increment step retry count
     */
    async incrementStepRetry(id) {
      const step = await prisma.step.findUnique({
        where: { id }
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
          retryCount: step.retryCount + 1
        }
      })
    },

    /**
     * Get next pending step for a run
     */
    async getNextPendingStep(runId) {
      return await prisma.step.findFirst({
        where: {
          runId,
          status: 'waiting'
        },
        orderBy: { stepIndex: 'asc' }
      })
    },

    /**
     * Atomically claim a step (prevents race conditions)
     * Returns the updated step if claim succeeded, null if already claimed
     */
    async claimStep(id, agentId) {
      // Use updateMany with WHERE clause for atomic claim
      const result = await prisma.step.updateMany({
        where: {
          id,
          status: 'waiting'
        },
        data: {
          status: 'running'
        }
      })

      if (result.count === 0) {
        // Step was already claimed or doesn't exist
        return null
      }

      // Fetch and return the updated step
      return await prisma.step.findUnique({
        where: { id }
      })
    },

    /**
     * Complete a step and update run status atomically (transactional)
     * Returns { step, runCompleted }
     */
    async completeStepWithRunUpdate(stepId, output = null) {
      return await prisma.$transaction(async (tx) => {
        // Update step status
        const updateData = { status: 'completed' }
        if (output !== null) {
          updateData.output = typeof output === 'string' ? output : JSON.stringify(output)
        }

        const step = await tx.step.update({
          where: { id: stepId },
          data: updateData
        })

        // Check if all steps are completed
        const allSteps = await tx.step.findMany({
          where: { runId: step.runId }
        })

        const allCompleted = allSteps.every(s => s.status === 'completed')

        if (allCompleted) {
          // Update run status to completed
          await tx.run.update({
            where: { id: step.runId },
            data: { status: 'completed' }
          })
        }

        return {
          step,
          runCompleted: allCompleted
        }
      })
    }
  }
}
