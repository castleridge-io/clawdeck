import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert'

// ========================================
// Mock Prisma
// ========================================
const mockPrisma = {
  step: {
    findMany: mock.fn(),
    update: mock.fn(),
    updateMany: mock.fn(),
    fields: { maxRetries: 'maxRetries' },
  },
  run: {
    findMany: mock.fn(),
    update: mock.fn(),
  },
}

// ========================================
// Tests for Scheduler Service
// ========================================

describe('Scheduler Service', () => {
  beforeEach(() => {
    mockPrisma.step.findMany.mock.resetCalls()
    mockPrisma.step.update.mock.resetCalls()
    mockPrisma.step.updateMany.mock.resetCalls()
    mockPrisma.run.findMany.mock.resetCalls()
    mockPrisma.run.update.mock.resetCalls()
  })

  describe('cleanupAbandonedSteps', () => {
    it('should reset abandoned steps to pending', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService(
        { abandonedStepAgeMinutes: 15 },
        { prisma: mockPrisma }
      )

      const oldTime = new Date(Date.now() - 20 * 60 * 1000) // 20 mins ago
      mockPrisma.step.findMany.mock.mockImplementation(async () => [
        { id: 'step-1', status: 'running', updatedAt: oldTime },
        { id: 'step-2', status: 'running', updatedAt: oldTime },
      ])
      mockPrisma.step.update.mock.mockImplementation(async () => ({ id: 'step-1' }))

      const count = await scheduler.cleanupAbandonedSteps()

      assert.strictEqual(count, 2)
    })

    it('should return 0 when no abandoned steps', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService({}, { prisma: mockPrisma })

      mockPrisma.step.findMany.mock.mockImplementation(async () => [])

      const count = await scheduler.cleanupAbandonedSteps()

      assert.strictEqual(count, 0)
    })
  })

  describe('retryFailedSteps', () => {
    it('should retry failed steps with remaining retries', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService(
        { retryCooldownMinutes: 5 },
        { prisma: mockPrisma }
      )

      const oldTime = new Date(Date.now() - 10 * 60 * 1000) // 10 mins ago
      mockPrisma.step.findMany.mock.mockImplementation(async () => [
        { id: 'step-1', status: 'failed', retryCount: 0, maxRetries: 3, updatedAt: oldTime },
      ])
      mockPrisma.step.update.mock.mockImplementation(async () => ({ id: 'step-1' }))

      const count = await scheduler.retryFailedSteps()

      assert.strictEqual(count, 1)
    })

    it('should not retry steps at max retries', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService({}, { prisma: mockPrisma })

      mockPrisma.step.findMany.mock.mockImplementation(async () => [])

      const count = await scheduler.retryFailedSteps()

      assert.strictEqual(count, 0)
    })
  })

  describe('timeoutStuckRuns', () => {
    it('should mark stuck runs as failed', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService(
        { runTimeoutMinutes: 60 },
        { prisma: mockPrisma }
      )

      const oldTime = new Date(Date.now() - 90 * 60 * 1000) // 90 mins ago
      mockPrisma.run.findMany.mock.mockImplementation(async () => [
        { id: 'run-1', status: 'running', updatedAt: oldTime },
      ])
      mockPrisma.run.update.mock.mockImplementation(async () => ({ id: 'run-1' }))
      mockPrisma.step.updateMany.mock.mockImplementation(async () => ({ count: 1 }))

      const count = await scheduler.timeoutStuckRuns()

      assert.strictEqual(count, 1)
    })

    it('should return 0 when no stuck runs', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService({}, { prisma: mockPrisma })

      mockPrisma.run.findMany.mock.mockImplementation(async () => [])

      const count = await scheduler.timeoutStuckRuns()

      assert.strictEqual(count, 0)
    })
  })

  describe('runAllScheduled', () => {
    it('should run all cleanup tasks and return summary', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService({}, { prisma: mockPrisma })

      mockPrisma.step.findMany.mock.mockImplementation(async () => [])
      mockPrisma.run.findMany.mock.mockImplementation(async () => [])
      mockPrisma.step.updateMany.mock.mockImplementation(async () => ({ count: 0 }))

      const result = await scheduler.runAllScheduled()

      assert.strictEqual(typeof result.abandonedSteps, 'number')
      assert.strictEqual(typeof result.retriedSteps, 'number')
      assert.strictEqual(typeof result.timedOutRuns, 'number')
    })
  })

  describe('getConfig', () => {
    it('should return current configuration', async () => {
      const { createSchedulerService } = await import('../../src/services/scheduler.service.js')
      const scheduler = createSchedulerService({
        abandonedStepAgeMinutes: 30,
        retryCooldownMinutes: 10,
        runTimeoutMinutes: 120,
      })

      const config = scheduler.getConfig()

      assert.strictEqual(config.abandonedStepAgeMinutes, 30)
      assert.strictEqual(config.retryCooldownMinutes, 10)
      assert.strictEqual(config.runTimeoutMinutes, 120)
    })
  })
})
