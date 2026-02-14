/**
 * Scheduler Service
 *
 * Provides scheduled maintenance tasks for workflow execution:
 * - Abandoned step cleanup (reset stuck steps)
 * - Auto-retry for failed steps
 * - Run timeout handling
 */

import { prisma as defaultPrisma } from '../db/prisma.js'

export interface SchedulerConfig {
  /** Minutes before a step is considered abandoned (default: 15) */
  abandonedStepAgeMinutes: number
  /** Minutes before retrying a failed step (default: 5) */
  retryCooldownMinutes: number
  /** Minutes before a run is considered timed out (default: 60) */
  runTimeoutMinutes: number
}

interface PrismaClient {
  step: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<unknown[]>
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>
    fields: { maxRetries: string }
  }
  run: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<unknown[]>
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>
  }
}

const DEFAULT_CONFIG: SchedulerConfig = {
  abandonedStepAgeMinutes: 15,
  retryCooldownMinutes: 5,
  runTimeoutMinutes: 60,
}

export function createSchedulerService(
  config: Partial<SchedulerConfig> = {},
  options?: { prisma?: PrismaClient }
) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const prisma = (options?.prisma ?? defaultPrisma) as PrismaClient

  return {
    /**
     * Clean up steps that have been stuck in 'running' status for too long.
     * Resets them to 'pending' so they can be claimed again.
     *
     * @returns Number of steps cleaned up
     */
    async cleanupAbandonedSteps(): Promise<number> {
      const cutoffTime = new Date(Date.now() - cfg.abandonedStepAgeMinutes * 60 * 1000)

      const abandonedSteps = await prisma.step.findMany({
        where: {
          status: 'running',
          updatedAt: { lt: cutoffTime },
        },
      }) as Array<{ id: string }>

      for (const step of abandonedSteps) {
        await prisma.step.update({
          where: { id: step.id },
          data: {
            status: 'pending',
            output: `RESET: Step abandoned (stuck >${cfg.abandonedStepAgeMinutes} min)`,
          },
        })
      }

      return abandonedSteps.length
    },

    /**
     * Check for failed steps that have remaining retries and reset them
     * after a cooldown period.
     *
     * @returns Number of steps queued for retry
     */
    async retryFailedSteps(): Promise<number> {
      const cutoffTime = new Date(Date.now() - cfg.retryCooldownMinutes * 60 * 1000)

      // Find failed steps with remaining retries
      const retryableSteps = await prisma.step.findMany({
        where: {
          status: 'failed',
          retryCount: { lt: prisma.step.fields.maxRetries },
          updatedAt: { lt: cutoffTime },
        },
      }) as Array<{ id: string; retryCount: number; maxRetries: number }>

      for (const step of retryableSteps) {
        // Increment retry count and set to pending
        await prisma.step.update({
          where: { id: step.id },
          data: {
            status: 'pending',
            retryCount: step.retryCount + 1,
            output: `RETRY: Attempt ${step.retryCount + 1}/${step.maxRetries}`,
          },
        })
      }

      return retryableSteps.length
    },

    /**
     * Mark runs as failed if they've been running too long.
     *
     * @returns Number of runs timed out
     */
    async timeoutStuckRuns(): Promise<number> {
      const cutoffTime = new Date(Date.now() - cfg.runTimeoutMinutes * 60 * 1000)

      // Find runs that have been running too long
      const stuckRuns = await prisma.run.findMany({
        where: {
          status: 'running',
          updatedAt: { lt: cutoffTime },
        },
      }) as Array<{ id: string }>

      for (const run of stuckRuns) {
        await prisma.run.update({
          where: { id: run.id },
          data: {
            status: 'failed',
          },
        })

        // Mark all running steps as failed
        await prisma.step.updateMany({
          where: {
            runId: run.id,
            status: 'running',
          },
          data: {
            status: 'failed',
            output: 'RUN_TIMEOUT: Run exceeded maximum duration',
          },
        })
      }

      return stuckRuns.length
    },

    /**
     * Run all scheduled maintenance tasks.
     *
     * @returns Summary of cleanup results
     */
    async runAllScheduled(): Promise<{
      abandonedSteps: number
      retriedSteps: number
      timedOutRuns: number
    }> {
      const [abandonedSteps, retriedSteps, timedOutRuns] = await Promise.all([
        this.cleanupAbandonedSteps(),
        this.retryFailedSteps(),
        this.timeoutStuckRuns(),
      ])

      return { abandonedSteps, retriedSteps, timedOutRuns }
    },

    /**
     * Get scheduler configuration
     */
    getConfig(): SchedulerConfig {
      return { ...cfg }
    },
  }
}

export type SchedulerService = ReturnType<typeof createSchedulerService>
