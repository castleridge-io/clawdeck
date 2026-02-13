import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser
let testBoard
let testToken
let testTasks = []

async function setupTestEnvironment () {
  // Create test user
  testUser = await prisma.user.create({
    data: {
      emailAddress: `test-archive-${Date.now()}@example.com`,
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
      name: 'Test Archive Board',
      userId: testUser.id,
      position: 0,
    },
  })

  // Create test tasks
  const now = new Date()
  const oldDate = new Date(now.getTime() - 25 * 60 * 60 * 1000)

  testTasks = await Promise.all([
    // Archived task
    prisma.task.create({
      data: {
        name: 'Archived Task',
        boardId: testBoard.id,
        userId: testUser.id,
        status: 'done',
        completed: true,
        completedAt: oldDate,
        archived: true,
        archivedAt: now,
      },
    }),
    // Active task
    prisma.task.create({
      data: {
        name: 'Active Task',
        boardId: testBoard.id,
        userId: testUser.id,
        status: 'in_progress',
      },
    }),
    // Completed but not archived
    prisma.task.create({
      data: {
        name: 'Completed Task',
        boardId: testBoard.id,
        userId: testUser.id,
        status: 'done',
        completed: true,
        completedAt: now,
      },
    }),
  ])
}

async function cleanupTestEnvironment () {
  await prisma.taskActivity.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.apiToken.deleteMany({})
  await prisma.user.deleteMany({})
  testTasks = []
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
      data: text ? JSON.parse(text) : null,
    }
  } catch (error) {
    return { status: 0, error: error.message }
  }
}

describe('Archives API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('GET /api/v1/archives', () => {
    it('should return empty array when no archived tasks exist for user', async () => {
      // Create a different user with no tasks
      const otherUser = await prisma.user.create({
        data: {
          emailAddress: `other-${Date.now()}@example.com`,
          passwordDigest: 'hash',
        },
      })

      const otherToken = `cd_test_${Date.now()}_${Math.random().toString(36).substring(7)}`
      await prisma.apiToken.create({
        data: {
          token: otherToken,
          name: 'Other Token',
          userId: otherUser.id,
        },
      })

      const result = await makeRequest('GET', '/api/v1/archives', null, {
        Authorization: `Bearer ${otherToken}`,
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.deepStrictEqual(result.data.data, [])

      // Cleanup
      await prisma.apiToken.delete({ where: { token: otherToken } })
      await prisma.user.delete({ where: { id: otherUser.id } })
    })

    it('should return archived tasks for authenticated user', async () => {
      const result = await makeRequest('GET', '/api/v1/archives')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(result.data.data.length >= 1)

      const archivedTask = result.data.data.find((t) => t.name === 'Archived Task')
      assert.ok(archivedTask)
      assert.strictEqual(archivedTask.archived, true)
      assert.ok(archivedTask.archived_at)
    })

    it('should filter archived tasks by board_id', async () => {
      // Create another board with an archived task
      const otherBoard = await prisma.board.create({
        data: {
          name: 'Other Board',
          userId: testUser.id,
          position: 1,
        },
      })

      await prisma.task.create({
        data: {
          name: 'Other Board Archived Task',
          boardId: otherBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          archived: true,
          archivedAt: new Date(),
        },
      })

      // Query for specific board
      const result = await makeRequest('GET', `/api/v1/archives?board_id=${testBoard.id}`)

      assert.strictEqual(result.status, 200)
      assert.ok(result.data.data.every((t) => t.board_id === testBoard.id.toString()))
    })

    it('should include pagination metadata', async () => {
      const result = await makeRequest('GET', '/api/v1/archives?page=1&limit=10')

      assert.strictEqual(result.status, 200)
      assert.ok(result.data.meta)
      assert.strictEqual(typeof result.data.meta.total, 'number')
      assert.strictEqual(result.data.meta.page, 1)
      assert.strictEqual(result.data.meta.limit, 10)
      assert.strictEqual(typeof result.data.meta.pages, 'number')
    })

    it('should not include active (non-archived) tasks', async () => {
      const result = await makeRequest('GET', '/api/v1/archives')

      assert.strictEqual(result.status, 200)
      const activeTask = result.data.data.find((t) => t.name === 'Active Task')
      assert.strictEqual(activeTask, undefined)
    })
  })

  describe('PATCH /api/v1/archives/:id/unarchive', () => {
    it('should unarchive an archived task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Unarchive',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          archived: true,
          archivedAt: new Date(),
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/archives/${task.id}/unarchive`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.archived, false)
      assert.strictEqual(result.data.archived_at, null)

      // Verify in database
      const unarchivedTask = await prisma.task.findUnique({
        where: { id: task.id },
      })
      assert.strictEqual(unarchivedTask.archived, false)
    })

    it('should create activity record for unarchive', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task for Unarchive Activity',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          archived: true,
          archivedAt: new Date(),
        },
      })

      await makeRequest('PATCH', `/api/v1/archives/${task.id}/unarchive`)

      const activities = await prisma.taskActivity.findMany({
        where: { taskId: task.id },
      })

      const unarchiveActivity = activities.find((a) => a.action === 'unarchived')
      assert.ok(unarchiveActivity)
      assert.strictEqual(unarchiveActivity.oldValue, 'true')
      assert.strictEqual(unarchiveActivity.newValue, 'false')
    })

    it('should return 404 for non-existent task', async () => {
      const result = await makeRequest('PATCH', '/api/v1/archives/999999999/unarchive')

      assert.strictEqual(result.status, 404)
    })

    it('should return 400 for non-archived task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Active Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'in_progress',
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/archives/${task.id}/unarchive`)

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'Task is not archived')
    })
  })

  describe('DELETE /api/v1/archives/:id', () => {
    it('should permanently delete an archived task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Permanently Delete',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          archived: true,
          archivedAt: new Date(),
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/archives/${task.id}`)

      assert.strictEqual(result.status, 204)

      // Verify deletion
      const deletedTask = await prisma.task.findUnique({
        where: { id: task.id },
      })
      assert.strictEqual(deletedTask, null)
    })

    it('should return 404 for non-existent task', async () => {
      const result = await makeRequest('DELETE', '/api/v1/archives/999999999')

      assert.strictEqual(result.status, 404)
    })

    it('should return 400 for non-archived task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Active Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'in_progress',
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/archives/${task.id}`)

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Only archived tasks'))
    })
  })

  describe('PATCH /api/v1/archives/:id/schedule', () => {
    it('should immediately archive a completed task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Schedule Archive',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: new Date(),
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/archives/${task.id}/schedule`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.archived, true)
      assert.ok(result.data.data.archived_at)
    })

    it('should return 400 for incomplete task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Incomplete Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'in_progress',
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/archives/${task.id}/schedule`)

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'Only completed tasks can be archived')
    })

    it('should return 400 for already archived task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Already Archived Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          archived: true,
          archivedAt: new Date(),
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/archives/${task.id}/schedule`)

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'Task is already archived')
    })

    it('should create activity record for scheduled archive', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task for Archive Activity',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: new Date(),
        },
      })

      await makeRequest('PATCH', `/api/v1/archives/${task.id}/schedule`)

      const activities = await prisma.taskActivity.findMany({
        where: { taskId: task.id },
      })

      const archiveActivity = activities.find((a) => a.action === 'archived')
      assert.ok(archiveActivity)
      assert.strictEqual(archiveActivity.source, 'scheduler')
    })
  })
})

describe('Archives and Tasks Integration', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  it('should exclude archived tasks from default tasks endpoint', async () => {
    const result = await makeRequest('GET', '/api/v1/tasks')

    assert.strictEqual(result.status, 200)
    const archivedTask = result.data.data.find((t) => t.name === 'Archived Task')
    assert.strictEqual(archivedTask, undefined)
  })

  it('should include archived fields in task JSON', async () => {
    const task = await prisma.task.create({
      data: {
        name: 'Task with Archive Fields',
        boardId: testBoard.id,
        userId: testUser.id,
        status: 'done',
        completed: true,
        archived: true,
        archivedAt: new Date(),
      },
    })

    const result = await makeRequest('GET', '/api/v1/tasks?archived=true')

    assert.strictEqual(result.status, 200)
    const taskWithFields = result.data.data.find((t) => t.name === 'Task with Archive Fields')
    assert.ok(taskWithFields)
    assert.strictEqual(taskWithFields.archived, true)
    assert.ok(taskWithFields.archived_at)
  })

  it('should return only archived tasks when archived=true', async () => {
    const result = await makeRequest('GET', '/api/v1/tasks?archived=true')

    assert.strictEqual(result.status, 200)
    assert.ok(result.data.data.every((t) => t.archived === true))
  })

  it('should return only active tasks when archived=false', async () => {
    const result = await makeRequest('GET', '/api/v1/tasks?archived=false')

    assert.strictEqual(result.status, 200)
    assert.ok(result.data.data.every((t) => t.archived === false))
  })
})

export { setupTestEnvironment, cleanupTestEnvironment }
