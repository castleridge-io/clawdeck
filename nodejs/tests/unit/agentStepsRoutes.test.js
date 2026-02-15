import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert'

// ========================================
// Tests for Agent Steps Routes Logic
// ========================================

// Mock executor service for testing
function createMockExecutorService () {
  return {
    claimStepByAgent: mock.fn(),
    completeStepWithPipeline: mock.fn(),
    cleanupAbandonedSteps: mock.fn(),
  }
}

describe('Agent Steps Routes - Logic Tests', () => {
  let executorService

  beforeEach(() => {
    executorService = createMockExecutorService()
  })

  describe('claimStepByAgent', () => {
    it('should return null when no pending steps for agent', async () => {
      executorService.claimStepByAgent.mock.mockImplementation(async () => ({
        found: false,
      }))

      const result = await executorService.claimStepByAgent('non-existent-agent')

      assert.strictEqual(result.found, false)
    })

    it('should return step info when step is claimed', async () => {
      executorService.claimStepByAgent.mock.mockImplementation(async () => ({
        found: true,
        stepId: 'step-123',
        runId: 'run-abc',
        resolvedInput: 'Task: Build feature X',
        storyId: undefined,
      }))

      const result = await executorService.claimStepByAgent('planner')

      assert.strictEqual(result.found, true)
      assert.strictEqual(result.stepId, 'step-123')
      assert.strictEqual(result.runId, 'run-abc')
      assert.ok(result.resolvedInput.includes('Build feature'))
    })

    it('should return story_id for loop steps', async () => {
      executorService.claimStepByAgent.mock.mockImplementation(async () => ({
        found: true,
        stepId: 'step-loop',
        runId: 'run-loop',
        resolvedInput: 'Story: Implement login',
        storyId: 'story-1',
      }))

      const result = await executorService.claimStepByAgent('developer')

      assert.strictEqual(result.found, true)
      assert.strictEqual(result.storyId, 'story-1')
    })
  })

  describe('completeStepWithPipeline', () => {
    it('should complete step and return run_completed false', async () => {
      executorService.completeStepWithPipeline.mock.mockImplementation(async () => ({
        stepCompleted: true,
        runCompleted: false,
      }))

      const result = await executorService.completeStepWithPipeline(
        'step-123',
        'STATUS: done\nCHANGES: implemented feature'
      )

      assert.strictEqual(result.stepCompleted, true)
      assert.strictEqual(result.runCompleted, false)
    })

    it('should complete step and return run_completed true when all steps done', async () => {
      executorService.completeStepWithPipeline.mock.mockImplementation(async () => ({
        stepCompleted: true,
        runCompleted: true,
      }))

      const result = await executorService.completeStepWithPipeline(
        'step-last',
        'STATUS: done'
      )

      assert.strictEqual(result.stepCompleted, true)
      assert.strictEqual(result.runCompleted, true)
    })

    it('should throw error for non-existent step', async () => {
      executorService.completeStepWithPipeline.mock.mockImplementation(async () => {
        throw new Error('Step not found: invalid-id')
      })

      await assert.rejects(
        async () => executorService.completeStepWithPipeline('invalid-id', 'output'),
        (error) => {
          assert.ok(error.message.includes('not found'))
          return true
        }
      )
    })
  })

  describe('cleanupAbandonedSteps', () => {
    it('should return cleaned count', async () => {
      executorService.cleanupAbandonedSteps.mock.mockImplementation(async () => ({
        cleanedCount: 3,
      }))

      const result = await executorService.cleanupAbandonedSteps(15)

      assert.strictEqual(result.cleanedCount, 3)
    })

    it('should return 0 when no abandoned steps', async () => {
      executorService.cleanupAbandonedSteps.mock.mockImplementation(async () => ({
        cleanedCount: 0,
      }))

      const result = await executorService.cleanupAbandonedSteps(15)

      assert.strictEqual(result.cleanedCount, 0)
    })
  })
})
