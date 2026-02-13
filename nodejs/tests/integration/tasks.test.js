import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser
let testBoard
let testToken

async function setupTestEnvironment () {
  // Create test user
  testUser = await prisma.user.create({
    data: {
      emailAddress: `test-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖',
    },
  })

  // Create test API token
  testToken = `cd_test_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await prisma.apiToken.create({
    data: {
      token: testToken,
      name: 'Test Token',
      userId: testUser.id,
    },
  })

  // Create test board
  testBoard = await prisma.board.create({
    data: {
      name: 'Test Board',
      userId: testUser.id,
      position: 0,
    },
  })
}

async function cleanupTestEnvironment () {
  // Clean up in reverse order of dependencies
  await prisma.taskActivity.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.apiToken.deleteMany({})
  await prisma.user.deleteMany({})
}

async function makeRequest (method, path, body = null, headers = {}) {
  const baseUrl = process.env.API_URL || 'http://localhost:3000'
  const url = new URL(path, baseUrl)

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${testToken}`,
      'X-Agent-Name': 'TestAgent',
      ...headers,
    },
  }

  // Only set Content-Type if we have a body
  if (body !== null) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  } else if (['PATCH', 'POST', 'PUT'].includes(method.toUpperCase())) {
    // For PATCH/POST/PUT without body, send empty JSON object
    options.headers['Content-Type'] = 'application/json'
    options.body = '{}'
  }

  try {
    const response = await fetch(url.toString(), options)
    const text = await response.text()
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
    }
  } catch (error) {
    return { status: 0, error: error.message }
  }
}

describe('Tasks API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('GET /api/v1/tasks', () => {
    it('should return empty array when no tasks exist', async () => {
      const result = await makeRequest('GET', '/api/v1/tasks')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.deepStrictEqual(result.data.data, [])
    })

    it('should return tasks assigned to agent', async () => {
      // Create test task
      await prisma.task.create({
        data: {
          name: 'Test Task',
          description: 'Test description',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'up_next',
          assignedToAgent: true,
          assignedAt: new Date(),
        },
      })

      const result = await makeRequest('GET', '/api/v1/tasks?assigned=true')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.length, 1)
      assert.strictEqual(result.data.data[0].name, 'Test Task')
      assert.strictEqual(result.data.data[0].assigned_to_agent, true)
    })
  })

  describe('POST /api/v1/tasks', () => {
    it('should create a new task', async () => {
      const result = await makeRequest('POST', '/api/v1/tasks', {
        name: 'New Task',
        description: 'New task description',
        board_id: testBoard.id.toString(),
        status: 'inbox',
        priority: 'medium',
      })

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.name, 'New Task')
      assert.strictEqual(result.data.description, 'New task description')
    })

    it('should require board_id', async () => {
      const result = await makeRequest('POST', '/api/v1/tasks', {
        name: 'Task without board',
      })

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'board_id is required')
    })
  })

  describe('GET /api/v1/tasks/next', () => {
    it('should return 204 when auto mode is disabled', async () => {
      // Disable auto mode
      await prisma.user.update({
        where: { id: testUser.id },
        data: { agentAutoMode: false },
      })

      const result = await makeRequest('GET', '/api/v1/tasks/next')

      assert.strictEqual(result.status, 204)

      // Re-enable for other tests
      await prisma.user.update({
        where: { id: testUser.id },
        data: { agentAutoMode: true },
      })
    })

    it('should return next up_next task when auto mode enabled', async () => {
      // Create task in up_next
      await prisma.task.create({
        data: {
          name: 'Next Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'up_next',
          priority: 'medium',
          position: 1,
        },
      })

      const result = await makeRequest('GET', '/api/v1/tasks/next')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.name, 'Next Task')
    })
  })

  describe('PATCH /api/v1/tasks/:id', () => {
    it('should update task status', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Update',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'inbox',
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/tasks/${task.id}`, {
        status: 'in_progress',
        activity_note: 'Starting work on this task',
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.status, 'in_progress')
    })

    it('should return 404 for non-existent task', async () => {
      const result = await makeRequest('PATCH', '/api/v1/tasks/999999999', {
        status: 'done',
      })

      assert.strictEqual(result.status, 404)
    })
  })

  describe('PATCH /api/v1/tasks/:id/claim', () => {
    it('should claim a task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Claim',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'up_next',
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/tasks/${task.id}/claim`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.status, 'in_progress')
      assert.ok(result.data.agent_claimed_at)
    })
  })

  describe('PATCH /api/v1/tasks/:id/assign', () => {
    it('should assign task to agent', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Assign',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'inbox',
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/tasks/${task.id}/assign`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.assigned_to_agent, true)
      assert.ok(result.data.assigned_at)
    })
  })

  describe('DELETE /api/v1/tasks/:id', () => {
    it('should delete a task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Delete',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'inbox',
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/tasks/${task.id}`)

      assert.strictEqual(result.status, 204)

      // Verify deletion
      const deleted = await prisma.task.findUnique({
        where: { id: task.id },
      })
      assert.strictEqual(deleted, null)
    })
  })
})

// Export for running tests
export { setupTestEnvironment, cleanupTestEnvironment }
