import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser
let testBoard
let testToken
let testWorkflow
let testRun
let testTask

async function setupTestEnvironment () {
  // Create test user
  testUser = await prisma.user.create({
    data: {
      emailAddress: `story-test-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'StoryTestAgent',
      agentEmoji: '📖'
    }
  })

  // Create test API token
  testToken = `cd_story_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await prisma.apiToken.create({
    data: {
      token: testToken,
      name: 'Story Test Token',
      userId: testUser.id
    }
  })

  // Create test board
  testBoard = await prisma.board.create({
    data: {
      name: 'Story Test Board',
      userId: testUser.id,
      position: 0
    }
  })

  // Create test workflow
  testWorkflow = await prisma.workflow.create({
    data: {
      name: 'story-test-workflow',
      description: 'Workflow for story testing',
      config: {
        steps: [
          { stepId: 'implement', agentId: 'developer', inputTemplate: 'Implement: {story}', type: 'loop' }
        ]
      }
    }
  })

  // Create test task
  testTask = await prisma.task.create({
    data: {
      name: 'Story Test Task',
      boardId: testBoard.id,
      userId: testUser.id
    }
  })

  // Create test run
  testRun = await prisma.run.create({
    data: {
      id: `run-story-test-${Date.now()}`,
      workflowId: testWorkflow.id.toString(),
      taskId: testTask.id.toString(),
      task: 'Test task for stories',
      status: 'running',
      context: '{}'
    }
  })
}

async function cleanupTestEnvironment () {
  await prisma.story.deleteMany({})
  await prisma.step.deleteMany({})
  await prisma.run.deleteMany({})
  await prisma.workflow.deleteMany({})
  await prisma.taskActivity.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.apiToken.deleteMany({})
  await prisma.user.deleteMany({})
}

async function makeRequest (method, path, body = null, headers = {}) {
  const baseUrl = process.env.API_URL || 'http://localhost:3333'
  const url = new URL(path, baseUrl)

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${testToken}`,
      'X-Agent-Name': 'StoryTestAgent',
      ...headers
    }
  }

  if (body !== null) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  } else if (['PATCH', 'POST', 'PUT'].includes(method.toUpperCase())) {
    options.headers['Content-Type'] = 'application/json'
    options.body = '{}'
  }

  try {
    const response = await fetch(url.toString(), options)
    const text = await response.text()
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null
    }
  } catch (error) {
    return { status: 0, error: error.message }
  }
}

describe('Stories API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('GET /api/v1/runs/:runId/stories', () => {
    it('should return empty array when no stories exist', async () => {
      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/stories`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.deepStrictEqual(result.data.data, [])
    })

    it('should return list of stories for a run', async () => {
      // Create test stories
      await prisma.story.create({
        data: {
          id: `story-list-1-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 0,
          storyId: 'story-1',
          title: 'First story',
          description: 'First story description',
          status: 'pending'
        }
      })

      await prisma.story.create({
        data: {
          id: `story-list-2-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 1,
          storyId: 'story-2',
          title: 'Second story',
          description: 'Second story description',
          status: 'pending'
        }
      })

      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/stories`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(Array.isArray(result.data.data))
      assert.strictEqual(result.data.data.length, 2)
      assert.strictEqual(result.data.data[0].title, 'First story')
      assert.strictEqual(result.data.data[1].title, 'Second story')
    })

    it('should return 404 for non-existent run', async () => {
      const result = await makeRequest('GET', '/api/v1/runs/non-existent-run/stories')

      assert.strictEqual(result.status, 404)
      assert.strictEqual(result.data.error, 'Run not found')
    })
  })

  describe('GET /api/v1/runs/:runId/stories/:storyId', () => {
    it('should return a single story', async () => {
      const story = await prisma.story.create({
        data: {
          id: `story-get-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 0,
          storyId: 'story-get',
          title: 'Get story test',
          description: 'Description',
          acceptanceCriteria: '- Criteria 1\n- Criteria 2',
          status: 'pending'
        }
      })

      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/stories/${story.id}`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.id, story.id)
      assert.strictEqual(result.data.data.title, 'Get story test')
      assert.strictEqual(result.data.data.acceptance_criteria, '- Criteria 1\n- Criteria 2')
    })

    it('should return 404 for non-existent story', async () => {
      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/stories/non-existent-story`)

      assert.strictEqual(result.status, 404)
      assert.strictEqual(result.data.error, 'Story not found')
    })
  })

  describe('POST /api/v1/runs/:runId/stories', () => {
    it('should create a new story', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories`, {
        story_index: 0,
        story_id: 'new-story',
        title: 'New Story',
        description: 'New story description',
        acceptance_criteria: ['AC1', 'AC2', 'AC3']
      })

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.title, 'New Story')
      assert.strictEqual(result.data.data.story_index, 0)
      assert.strictEqual(result.data.data.acceptance_criteria, '- AC1\n- AC2\n- AC3')
    })

    it('should require title', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories`, {
        description: 'Story without title'
      })

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'title is required')
    })

    it('should return 404 for non-existent run', async () => {
      const result = await makeRequest('POST', '/api/v1/runs/non-existent-run/stories', {
        title: 'Test'
      })

      assert.strictEqual(result.status, 404)
      assert.strictEqual(result.data.error, 'Run not found')
    })

    it('should handle acceptance_criteria as object', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories`, {
        story_index: 100,
        story_id: 'object-criteria-story',
        title: 'Story with object criteria',
        acceptance_criteria: { functionality: 'Must work', performance: 'Fast' }
      })

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.success, true)
      assert.ok(result.data.data.acceptance_criteria.includes('functionality: Must work'))
      assert.ok(result.data.data.acceptance_criteria.includes('performance: Fast'))
    })

    it('should handle acceptance_criteria as string', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories`, {
        story_index: 101,
        story_id: 'string-criteria-story',
        title: 'Story with string criteria',
        acceptance_criteria: 'Custom acceptance criteria string'
      })

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.data.acceptance_criteria, 'Custom acceptance criteria string')
    })
  })

  describe('POST /api/v1/runs/:runId/stories/:storyId/start', () => {
    let testStory

    beforeEach(async () => {
      await prisma.story.deleteMany({ where: { runId: testRun.id } })
      testStory = await prisma.story.create({
        data: {
          id: `story-start-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 0,
          storyId: 'story-start',
          title: 'Story to start',
          description: 'Description',
          status: 'pending'
        }
      })
    })

    it('should start a story successfully', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories/${testStory.id}/start`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.status, 'running')
    })

    it('should fail to start non-pending story', async () => {
      await prisma.story.update({
        where: { id: testStory.id },
        data: { status: 'running' }
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories/${testStory.id}/start`)

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('cannot be started'))
    })
  })

  describe('POST /api/v1/runs/:runId/stories/:storyId/complete', () => {
    let testStory

    beforeEach(async () => {
      await prisma.story.deleteMany({ where: { runId: testRun.id } })
      testStory = await prisma.story.create({
        data: {
          id: `story-complete-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 0,
          storyId: 'story-complete',
          title: 'Story to complete',
          description: 'Description',
          status: 'running'
        }
      })
    })

    it('should complete a story successfully', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories/${testStory.id}/complete`, {
        output: { implemented: true, files: ['file1.js', 'file2.js'] }
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.status, 'completed')
      assert.deepStrictEqual(result.data.data.output, { implemented: true, files: ['file1.js', 'file2.js'] })
    })

    it('should fail to complete non-running story', async () => {
      await prisma.story.update({
        where: { id: testStory.id },
        data: { status: 'pending' }
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories/${testStory.id}/complete`, {
        output: { done: true }
      })

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('cannot be completed'))
    })
  })

  describe('POST /api/v1/runs/:runId/stories/:storyId/fail', () => {
    let testStory

    beforeEach(async () => {
      await prisma.story.deleteMany({ where: { runId: testRun.id } })
      testStory = await prisma.story.create({
        data: {
          id: `story-fail-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 0,
          storyId: 'story-fail',
          title: 'Story to fail',
          description: 'Description',
          status: 'running',
          maxRetries: 3
        }
      })
    })

    it('should fail a story and queue retry', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories/${testStory.id}/fail`, {
        error: 'Implementation failed'
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.will_retry, true)
      assert.strictEqual(result.data.data.status, 'pending')
      assert.ok(result.data.message.includes('retry'))
    })

    it('should require error message', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories/${testStory.id}/fail`, {})

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('error message is required'))
    })

    it('should mark story as failed after max retries', async () => {
      // Set retry count to max
      await prisma.story.update({
        where: { id: testStory.id },
        data: { retryCount: 3 }
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/stories/${testStory.id}/fail`, {
        error: 'Final failure'
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.will_retry, false)
      assert.strictEqual(result.data.data.status, 'failed')
    })
  })

  describe('PATCH /api/v1/runs/:runId/stories/:storyId', () => {
    it('should update story output', async () => {
      const story = await prisma.story.create({
        data: {
          id: `story-patch-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 0,
          storyId: 'story-patch',
          title: 'Story to patch',
          description: 'Description',
          status: 'completed'
        }
      })

      const result = await makeRequest('PATCH', `/api/v1/runs/${testRun.id}/stories/${story.id}`, {
        output: { notes: 'Added some notes after completion' }
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.deepStrictEqual(result.data.data.output, { notes: 'Added some notes after completion' })
    })

    it('should require status or output', async () => {
      const story = await prisma.story.create({
        data: {
          id: `story-patch-2-${Date.now()}`,
          runId: testRun.id,
          storyIndex: 1,
          storyId: 'story-patch-2',
          title: 'Story 2',
          description: 'Description',
          status: 'pending'
        }
      })

      const result = await makeRequest('PATCH', `/api/v1/runs/${testRun.id}/stories/${story.id}`, {})

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('status or output'))
    })
  })
})
