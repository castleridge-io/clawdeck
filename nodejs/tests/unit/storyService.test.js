import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'
import { createWorkflowService } from '../../src/services/workflow.service.js'
import { createRunService } from '../../src/services/run.service.js'
import { createStoryService } from '../../src/services/story.service.js'

// Test utilities
let testUser
let testBoard
let workflowService
let runService
let storyService

async function setupTestEnvironment () {
  testUser = await prisma.user.create({
    data: {
      emailAddress: `story-unit-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖',
    },
  })

  testBoard = await prisma.board.create({
    data: {
      name: 'Test Board',
      userId: testUser.id,
      position: 0,
    },
  })

  workflowService = createWorkflowService()
  runService = createRunService()
  storyService = createStoryService()
}

async function cleanupTestEnvironment () {
  await prisma.story.deleteMany({})
  await prisma.step.deleteMany({})
  await prisma.run.deleteMany({})
  await prisma.workflow.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.user.deleteMany({})
}

describe('Story Service', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('createStory', () => {
    it('should create a story with valid data', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'test-story-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const data = {
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'User authentication',
        description: 'Implement user login and signup',
        acceptanceCriteria: 'User can login with email and password',
      }

      const story = await storyService.createStory(data)

      assert.ok(story.id)
      assert.strictEqual(story.runId, run.id)
      assert.strictEqual(story.storyId, 'story-1')
      assert.strictEqual(story.title, 'User authentication')
      assert.strictEqual(story.status, 'pending')
      assert.strictEqual(story.retryCount, 0)
    })

    it('should throw error when run does not exist', async () => {
      const data = {
        runId: 'non-existent-run-id',
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
      }

      await assert.rejects(
        () => storyService.createStory(data),
        (error) => {
          assert.ok(error.message.includes('Run not found'))
          return true
        }
      )
    })
  })

  describe('getStory', () => {
    it('should return story by id', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'get-story-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Get Story',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const created = await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
      })

      const story = await storyService.getStory(created.id)

      assert.ok(story)
      assert.strictEqual(story.id, created.id)
      assert.strictEqual(story.title, 'Test Story')
    })

    it('should return null for non-existent story', async () => {
      const story = await storyService.getStory('non-existent-story-id')

      assert.strictEqual(story, null)
    })
  })

  describe('listStoriesByRunId', () => {
    it('should return stories ordered by storyIndex', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'list-stories-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task List Stories',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      // Create stories in reverse order
      await storyService.createStory({
        runId: run.id,
        storyIndex: 1,
        storyId: 'story-2',
        title: 'Story 2',
        description: 'Second story',
        acceptanceCriteria: 'Criteria 2',
      })

      await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Story 1',
        description: 'First story',
        acceptanceCriteria: 'Criteria 1',
      })

      const stories = await storyService.listStoriesByRunId(run.id)

      assert.strictEqual(stories.length, 2)
      assert.strictEqual(stories[0].storyId, 'story-1')
      assert.strictEqual(stories[1].storyId, 'story-2')
    })

    it('should return empty array for run with no stories', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'no-stories-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task No Stories',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const stories = await storyService.listStoriesByRunId(run.id)

      assert.deepStrictEqual(stories, [])
    })
  })

  describe('updateStoryStatus', () => {
    it('should update story status to running', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'update-story-running-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Update Running',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const story = await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
      })

      const updated = await storyService.updateStoryStatus(story.id, 'running')

      assert.strictEqual(updated.status, 'running')
    })

    it('should update story status to completed with output', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'update-story-completed-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Update Completed',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const story = await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
      })

      const output = { result: 'success', implementation: 'completed' }
      const updated = await storyService.updateStoryStatus(story.id, 'completed', output)

      assert.strictEqual(updated.status, 'completed')
      assert.strictEqual(updated.output, JSON.stringify(output))
    })

    it('should update story status to failed', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'update-story-failed-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Update Failed',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const story = await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
      })

      const updated = await storyService.updateStoryStatus(story.id, 'failed')

      assert.strictEqual(updated.status, 'failed')
    })

    it('should throw error for invalid status', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'invalid-story-status-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Invalid Story Status',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const story = await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
      })

      await assert.rejects(
        () => storyService.updateStoryStatus(story.id, 'invalid-status'),
        (error) => {
          assert.ok(error.message.includes('Invalid status'))
          return true
        }
      )
    })

    it('should throw error for non-existent story', async () => {
      await assert.rejects(
        () => storyService.updateStoryStatus('non-existent-story-id', 'running'),
        (error) => {
          assert.ok(error.message.includes('Story not found'))
          return true
        }
      )
    })
  })

  describe('incrementStoryRetry', () => {
    it('should increment retry count', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'increment-story-retry-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Increment Story Retry',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const story = await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
        maxRetries: 3,
      })

      const updated = await storyService.incrementStoryRetry(story.id)

      assert.strictEqual(updated.retryCount, 1)
    })

    it('should throw error when max retries exceeded', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'max-story-retries-workflow',
        description: 'Test',
        steps: [],
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Max Story Retries',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task',
      })

      const story = await storyService.createStory({
        runId: run.id,
        storyIndex: 0,
        storyId: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: 'Test criteria',
        maxRetries: 2,
      })

      // Increment to max
      await storyService.incrementStoryRetry(story.id)
      await storyService.incrementStoryRetry(story.id)

      // Should fail on third attempt
      await assert.rejects(
        () => storyService.incrementStoryRetry(story.id),
        (error) => {
          assert.ok(error.message.includes('Maximum retries exceeded'))
          return true
        }
      )
    })
  })
})
