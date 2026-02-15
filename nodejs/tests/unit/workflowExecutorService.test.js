import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert'

// ========================================
// Mock Prisma for DB-dependent tests
// ========================================
const mockPrisma = {
  step: {
    findFirst: mock.fn(),
    update: mock.fn(),
  },
  run: {
    findUnique: mock.fn(),
    update: mock.fn(),
  },
  story: {
    findFirst: mock.fn(),
    update: mock.fn(),
  },
}

// ========================================
// RED PHASE: These tests should FAIL first
// because the service doesn't exist yet
// ========================================

describe('Workflow Executor Service - Pure Functions', () => {
  describe('resolveTemplate', () => {
    it('should replace {{variable}} placeholders with context values', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const template = 'Hello {{name}}, your task is: {{task}}'
      const context = { name: 'Developer', task: 'Build feature X' }

      const result = executorService.resolveTemplate(template, context)

      assert.strictEqual(result, 'Hello Developer, your task is: Build feature X')
    })

    it('should handle missing variables gracefully', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const template = 'Task: {{task}}, Missing: {{unknown}}'
      const context = { task: 'Build feature' }

      const result = executorService.resolveTemplate(template, context)

      assert.strictEqual(result, 'Task: Build feature, Missing: [missing: unknown]')
    })

    it('should handle nested variable references', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const template = 'Story: {{current_story}}, Repo: {{repo}}'
      const context = {
        current_story: 'Story 1: Implement login\n\nDescription here',
        repo: '/path/to/repo'
      }

      const result = executorService.resolveTemplate(template, context)

      assert.ok(result.includes('Story 1: Implement login'))
      assert.ok(result.includes('/path/to/repo'))
    })

    it('should be case-insensitive for variable names', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const template = 'Task: {{TASK}}, Branch: {{Branch}}'
      const context = { task: 'Build feature', branch: 'main' }

      const result = executorService.resolveTemplate(template, context)

      assert.strictEqual(result, 'Task: Build feature, Branch: main')
    })
  })

  describe('mergeContextFromOutput', () => {
    it('should extract KEY: value pairs from output into context', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const output = `Working on the task...
STATUS: done
REPO: /home/user/project
BRANCH: feature-123
BUILD_CMD: npm run build
Some other text here`

      const existingContext = { task: 'Build feature' }
      const result = executorService.mergeContextFromOutput(output, existingContext)

      assert.strictEqual(result.status, 'done')
      assert.strictEqual(result.repo, '/home/user/project')
      assert.strictEqual(result.branch, 'feature-123')
      assert.strictEqual(result.build_cmd, 'npm run build')
      assert.strictEqual(result.task, 'Build feature') // Preserves existing
    })

    it('should not extract STORIES_JSON into context', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const output = `STATUS: done
STORIES_JSON: [{"id": "s1", "title": "Story 1"}]
REPO: /path`

      const result = executorService.mergeContextFromOutput(output, {})

      assert.strictEqual(result.status, 'done')
      assert.strictEqual(result.repo, '/path')
      assert.ok(!result.stories_json) // Should NOT be in context
    })
  })

  describe('parseStoriesJson', () => {
    it('should parse valid STORIES_JSON from output', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const output = `Planning complete.

STATUS: done
REPO: /home/user/project
BRANCH: feature-auth

STORIES_JSON: [
  {
    "id": "story-1",
    "title": "Setup database",
    "description": "Create users table",
    "acceptanceCriteria": ["Table exists", "Migration runs"]
  },
  {
    "id": "story-2",
    "title": "Create API endpoint",
    "description": "POST /api/users",
    "acceptanceCriteria": ["Endpoint returns 201", "Validation works"]
  }
]`

      const stories = executorService.parseStoriesJson(output)

      assert.strictEqual(stories.length, 2)
      assert.strictEqual(stories[0].id, 'story-1')
      assert.strictEqual(stories[0].title, 'Setup database')
      assert.deepStrictEqual(stories[0].acceptanceCriteria, ['Table exists', 'Migration runs'])
      assert.strictEqual(stories[1].id, 'story-2')
    })

    it('should return empty array if no STORIES_JSON found', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const output = `STATUS: done
REPO: /path
No stories here`

      const stories = executorService.parseStoriesJson(output)

      assert.deepStrictEqual(stories, [])
    })

    it('should throw error for invalid JSON', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const output = 'STORIES_JSON: [invalid json here'

      assert.throws(
        () => executorService.parseStoriesJson(output),
        (error) => {
          assert.ok(error.message.includes('Failed to parse STORIES_JSON'))
          return true
        }
      )
    })

    it('should throw error if stories exceed max limit (20)', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const tooManyStories = Array(21).fill(null).map((_, i) => ({
        id: `story-${i}`,
        title: `Story ${i}`,
        description: `Description ${i}`,
        acceptanceCriteria: ['AC1']
      }))

      const output = `STORIES_JSON: ${JSON.stringify(tooManyStories)}`

      assert.throws(
        () => executorService.parseStoriesJson(output),
        (error) => {
          assert.ok(error.message.includes('max is 20'))
          return true
        }
      )
    })

    it('should accept both camelCase and snake_case fields', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      // Using snake_case (from Antfarm format)
      const output = `STORIES_JSON: [
        {
          "id": "s1",
          "title": "Test",
          "description": "Desc",
          "acceptance_criteria": ["AC1"]
        }
      ]`

      const stories = executorService.parseStoriesJson(output)

      assert.strictEqual(stories.length, 1)
      assert.deepStrictEqual(stories[0].acceptanceCriteria, ['AC1'])
    })
  })

  describe('formatStoryForTemplate', () => {
    it('should format story object for template injection', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const story = {
        storyId: 's1',
        title: 'Implement login',
        description: 'Add user authentication',
        acceptanceCriteria: ['Login works', 'Session persists']
      }

      const result = executorService.formatStoryForTemplate(story)

      assert.ok(result.includes('Story s1: Implement login'))
      assert.ok(result.includes('Add user authentication'))
      assert.ok(result.includes('1. Login works'))
      assert.ok(result.includes('2. Session persists'))
    })
  })

  describe('formatCompletedStories', () => {
    it('should format list of completed stories', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const stories = [
        { storyId: 's1', title: 'Setup DB', status: 'completed' },
        { storyId: 's2', title: 'Create API', status: 'completed' },
        { storyId: 's3', title: 'Add UI', status: 'pending' },
      ]

      const result = executorService.formatCompletedStories(stories)

      assert.ok(result.includes('s1: Setup DB'))
      assert.ok(result.includes('s2: Create API'))
      assert.ok(!result.includes('s3: Add UI')) // Pending not included
    })

    it('should return "(none yet)" when no completed stories', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService()

      const stories = [
        { storyId: 's1', title: 'Setup DB', status: 'pending' },
      ]

      const result = executorService.formatCompletedStories(stories)

      assert.strictEqual(result, '(none yet)')
    })
  })
})

// ========================================
// TDD CYCLE 2: DB-Dependent Functions
// ========================================

describe('Workflow Executor Service - DB Functions', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockPrisma.step.findFirst.mock.resetCalls()
    mockPrisma.step.update.mock.resetCalls()
    mockPrisma.run.findUnique.mock.resetCalls()
    mockPrisma.run.update.mock.resetCalls()
    mockPrisma.story.findFirst.mock.resetCalls()
    mockPrisma.story.update.mock.resetCalls()
  })

  describe('claimStepByAgent', () => {
    it('should find and claim pending step for agent', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: A pending step exists for the agent
      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-123',
        runId: 'run-abc',
        stepId: 'plan',
        agentId: 'feature-dev/planner',
        inputTemplate: 'Plan the task: {{task}}',
        expects: 'STATUS: done',
        status: 'pending',
        type: 'single',
        run: {
          id: 'run-abc',
          context: '{"task":"Test task"}',
          status: 'running',
        },
      }))

      mockPrisma.step.update.mock.mockImplementation(async () => ({
        id: 'step-123',
        status: 'running',
      }))

      // #when: Agent claims work
      const result = await executorService.claimStepByAgent('feature-dev/planner')

      // #then: Step should be claimed with resolved input
      assert.strictEqual(result.found, true)
      assert.strictEqual(result.stepId, 'step-123')
      assert.strictEqual(result.runId, 'run-abc')
      assert.ok(result.resolvedInput.includes('Test task'))
    })

    it('should return found: false when no pending steps', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      mockPrisma.step.findFirst.mock.mockImplementation(async () => null)

      const result = await executorService.claimStepByAgent('non-existent-agent')

      assert.strictEqual(result.found, false)
    })

    it('should return found: false when run is not running', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // Query filters by run.status: 'running', so this won't be returned
      mockPrisma.step.findFirst.mock.mockImplementation(async () => null)

      const result = await executorService.claimStepByAgent('some-agent')

      assert.strictEqual(result.found, false)
    })

    it('should claim next pending story for loop steps', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: A loop step with pending story
      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-loop',
        runId: 'run-loop',
        stepId: 'implement',
        agentId: 'feature-dev/developer',
        inputTemplate: 'Story: {{current_story}}',
        expects: 'STATUS: done',
        status: 'pending',
        type: 'loop',
        loopConfig: { over: 'stories', completion: 'all_done' },
        run: {
          id: 'run-loop',
          context: '{"task":"Build feature"}',
          status: 'running',
        },
      }))

      mockPrisma.story.findFirst.mock.mockImplementation(async () => ({
        id: 'story-1',
        storyId: 's1',
        title: 'Setup database',
        description: 'Create tables',
        acceptanceCriteria: '["AC1", "AC2"]',
        status: 'pending',
      }))

      mockPrisma.story.update.mock.mockImplementation(async () => ({
        id: 'story-1',
        status: 'running',
      }))

      mockPrisma.step.update.mock.mockImplementation(async () => ({
        id: 'step-loop',
        status: 'running',
        currentStoryId: 'story-1',
      }))

      // #when: Agent claims work
      const result = await executorService.claimStepByAgent('feature-dev/developer')

      // #then: Should return story context
      assert.strictEqual(result.found, true)
      assert.strictEqual(result.storyId, 'story-1')
      assert.ok(result.resolvedInput.includes('Setup database'))
    })

    it('should return found: false when loop step has no pending stories', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-loop',
        runId: 'run-loop',
        status: 'pending',
        type: 'loop',
        loopConfig: { over: 'stories', completion: 'all_done' },
        run: { id: 'run-loop', status: 'running' },
      }))

      // No pending stories
      mockPrisma.story.findFirst.mock.mockImplementation(async () => null)

      const result = await executorService.claimStepByAgent('feature-dev/developer')

      assert.strictEqual(result.found, false)
    })
  })

  describe('advancePipeline', () => {
    it('should set next waiting step to pending', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: A waiting step exists
      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-waiting',
        runId: 'run-advance',
        stepId: 'develop',
        status: 'waiting',
      }))

      mockPrisma.step.update.mock.mockImplementation(async () => ({
        id: 'step-waiting',
        status: 'pending',
      }))

      // #when: Advance pipeline
      const result = await executorService.advancePipeline('run-advance')

      // #then: Step should be advanced
      assert.strictEqual(result.advanced, true)
      assert.strictEqual(result.runCompleted, false)
    })

    it('should mark run completed when no more waiting steps', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: No waiting steps
      mockPrisma.step.findFirst.mock.mockImplementation(async () => null)

      mockPrisma.run.update.mock.mockImplementation(async () => ({
        id: 'run-complete',
        status: 'completed',
      }))

      // #when: Advance pipeline
      const result = await executorService.advancePipeline('run-complete')

      // #then: Run should be marked completed
      assert.strictEqual(result.advanced, false)
      assert.strictEqual(result.runCompleted, true)
    })
  })

  describe('completeStepWithPipeline', () => {
    it('should complete step, merge context, and advance pipeline', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: Track call count to return different values
      let callCount = 0
      mockPrisma.step.findFirst.mock.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          // First call: find the step to complete
          return {
            id: 'step-123',
            runId: 'run-abc',
            status: 'running',
            type: 'single',
            inputTemplate: 'Task: {{task}}',
            run: {
              id: 'run-abc',
              context: '{"task":"Test task"}',
            },
          }
        }
        // Second call: find waiting step for advance
        return {
          id: 'step-next',
          status: 'waiting',
        }
      })

      mockPrisma.step.update.mock.mockImplementation(async () => ({
        id: 'step-123',
        status: 'completed',
      }))

      mockPrisma.run.update.mock.mockImplementation(async () => ({
        id: 'run-abc',
        context: '{"task":"Test task","status":"done","repo":"/path"}',
      }))

      // #when: Complete step with output
      const output = `STATUS: done
REPO: /path/to/repo
CHANGES: Implemented feature`

      const result = await executorService.completeStepWithPipeline('step-123', output)

      // #then: Should complete and advance
      assert.strictEqual(result.stepCompleted, true)
    })
  })
})

// ========================================
// TDD CYCLE 3: verify_each, approval, cleanup
// ========================================

describe('Workflow Executor Service - Remaining Features', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockPrisma.step.findFirst.mock.resetCalls()
    mockPrisma.step.update.mock.resetCalls()
    mockPrisma.run.findUnique.mock.resetCalls()
    mockPrisma.run.update.mock.resetCalls()
    mockPrisma.story.findFirst.mock.resetCalls()
    mockPrisma.story.update.mock.resetCalls()
  })

  describe('completeLoopStoryWithVerify', () => {
    it('should complete story and trigger verify step when verify_each is true', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: Loop step with verify_each enabled
      let findFirstCalls = 0
      mockPrisma.step.findFirst.mock.mockImplementation(async () => {
        findFirstCalls++
        if (findFirstCalls === 1) {
          // First call: get the loop step
          return {
            id: 'step-loop',
            runId: 'run-1',
            stepId: 'implement',
            type: 'loop',
            loopConfig: { over: 'stories', completion: 'all_done', verifyEach: true, verifyStep: 'verify' },
            currentStoryId: 'story-1',
            run: { id: 'run-1', context: '{}' },
          }
        }
        // Second call: find the verify step
        return {
          id: 'step-verify',
          runId: 'run-1',
          stepId: 'verify',
          status: 'waiting',
        }
      })

      mockPrisma.story.update.mock.mockImplementation(async () => ({
        id: 'story-1',
        status: 'verifying',
      }))

      mockPrisma.step.update.mock.mockImplementation(async () => ({ updated: true }))

      // #when: Complete loop story with output
      const result = await executorService.completeLoopStoryWithVerify('step-loop', 'STATUS: done')

      // #then: Story should be verifying, verify step should be pending
      assert.strictEqual(result.storyCompleted, false)
      assert.strictEqual(result.needsVerify, true)
    })

    it('should complete story without verify when verify_each is false', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: Loop step without verify_each
      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-loop',
        runId: 'run-1',
        type: 'loop',
        loopConfig: { over: 'stories', completion: 'all_done', verifyEach: false },
        currentStoryId: 'story-1',
        run: { id: 'run-1', context: '{}' },
      }))

      mockPrisma.story.update.mock.mockImplementation(async () => ({
        id: 'story-1',
        status: 'completed',
      }))

      mockPrisma.step.update.mock.mockImplementation(async () => ({ updated: true }))

      // #when: Complete loop story
      const result = await executorService.completeLoopStoryWithVerify('step-loop', 'STATUS: done')

      // #then: Story should be completed directly
      assert.strictEqual(result.storyCompleted, true)
      assert.strictEqual(result.needsVerify, false)
    })
  })

  describe('approveStep', () => {
    it('should approve an awaiting_approval step and advance pipeline', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: An approval step awaiting approval
      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-approval',
        runId: 'run-1',
        status: 'awaiting_approval',
        type: 'approval',
        run: { id: 'run-1', context: '{}' },
      }))

      mockPrisma.step.update.mock.mockImplementation(async () => ({
        id: 'step-approval',
        status: 'completed',
      }))

      // #when: Approve the step
      const result = await executorService.approveStep('step-approval', 'LGTM')

      // #then: Step should be completed
      assert.strictEqual(result.approved, true)
      assert.strictEqual(result.step.status, 'completed')
    })

    it('should throw error if step is not awaiting_approval', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: A step that is not awaiting approval
      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-1',
        status: 'running',
        type: 'single',
      }))

      // #when/then: Should throw
      await assert.rejects(
        async () => executorService.approveStep('step-1', 'LGTM'),
        (error) => {
          assert.ok(error.message.includes('not awaiting approval'))
          return true
        }
      )
    })
  })

  describe('rejectStep', () => {
    it('should reject an awaiting_approval step with reason', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: An approval step awaiting approval
      mockPrisma.step.findFirst.mock.mockImplementation(async () => ({
        id: 'step-approval',
        runId: 'run-1',
        status: 'awaiting_approval',
        type: 'approval',
        run: { id: 'run-1', context: '{}' },
      }))

      mockPrisma.step.update.mock.mockImplementation(async () => ({
        id: 'step-approval',
        status: 'failed',
      }))

      // #when: Reject the step
      const result = await executorService.rejectStep('step-approval', 'Needs more work')

      // #then: Step should be failed
      assert.strictEqual(result.rejected, true)
      assert.strictEqual(result.step.status, 'failed')
    })
  })

  describe('cleanupAbandonedSteps', () => {
    it('should reset steps stuck in running for more than 15 minutes', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: Mock prisma with findMany and updateMany
      const mockAbandonedSteps = [
        { id: 'step-stuck-1', runId: 'run-1', status: 'running', updatedAt: new Date(Date.now() - 20 * 60 * 1000) },
        { id: 'step-stuck-2', runId: 'run-1', status: 'running', updatedAt: new Date(Date.now() - 30 * 60 * 1000) },
      ]

      // Add findMany to mock if not present
      if (!mockPrisma.step.findMany) {
        mockPrisma.step.findMany = mock.fn()
      }
      mockPrisma.step.findMany.mock.mockImplementation(async () => mockAbandonedSteps)
      mockPrisma.step.update.mock.mockImplementation(async () => ({ updated: true }))

      // #when: Cleanup abandoned steps
      const result = await executorService.cleanupAbandonedSteps(15)

      // #then: Should report cleaned count
      assert.strictEqual(result.cleanedCount, 2)
    })

    it('should not reset recently updated steps', async () => {
      const { createWorkflowExecutorService } = await import('../../src/services/workflow-executor.service.js')
      const executorService = createWorkflowExecutorService({ prisma: mockPrisma })

      // #given: No abandoned steps (all recently updated)
      if (!mockPrisma.step.findMany) {
        mockPrisma.step.findMany = mock.fn()
      }
      mockPrisma.step.findMany.mock.mockImplementation(async () => [])

      // #when: Cleanup abandoned steps
      const result = await executorService.cleanupAbandonedSteps(15)

      // #then: Should report 0 cleaned
      assert.strictEqual(result.cleanedCount, 0)
    })
  })
})
