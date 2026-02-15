import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser1
let testUser2

async function setupTestEnvironment () {
  // Create test users
  testUser1 = await prisma.user.create({
    data: {
      emailAddress: `admin-test-user1-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent1',
      agentEmoji: '🤖',
    },
  })

  testUser2 = await prisma.user.create({
    data: {
      emailAddress: `admin-test-user2-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: false,
      agentName: null,
      agentEmoji: null,
    },
  })

  // Create test boards
  await prisma.board.create({
    data: {
      name: 'User 1 Board',
      icon: '📋',
      color: 'blue',
      userId: testUser1.id,
      position: 0,
    },
  })

  await prisma.board.create({
    data: {
      name: 'User 2 Board',
      icon: '📝',
      color: 'green',
      userId: testUser2.id,
      position: 0,
    },
  })

  // Test tasks are optional - boards are sufficient for testing
}

async function cleanupTestEnvironment () {
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.user.deleteMany({})
}

describe('Admin Service', () => {
  let adminService

  before(async () => {
    await setupTestEnvironment()
    // Import the service - will fail until we create it
    const { createAdminService } = await import('../../src/services/admin.service.js')
    adminService = createAdminService()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('listAllBoards', () => {
    it('should return all boards with owner info', async () => {
      const result = await adminService.listAllBoards(1, 50)

      assert.ok(result.data)
      assert.ok(result.meta)
      assert.ok(result.data.length >= 2)

      // Find our test boards
      const board1 = result.data.find((b) => b.name === 'User 1 Board')
      const board2 = result.data.find((b) => b.name === 'User 2 Board')

      assert.ok(board1, 'Board 1 should be found')
      assert.ok(board2, 'Board 2 should be found')

      // Verify owner info is included
      assert.ok(board1.owner, 'Board 1 should have owner')
      assert.ok(board2.owner, 'Board 2 should have owner')

      assert.strictEqual(board1.owner.emailAddress, testUser1.emailAddress)
      assert.strictEqual(board1.owner.agentName, 'TestAgent1')

      assert.strictEqual(board2.owner.emailAddress, testUser2.emailAddress)
      assert.strictEqual(board2.owner.agentName, null)
    })

    it('should include task count for each board', async () => {
      const result = await adminService.listAllBoards(1, 50)

      const board1 = result.data.find((b) => b.name === 'User 1 Board')

      assert.ok(board1)
      assert.ok(typeof board1.task_count === 'number')
      assert.ok(board1.task_count >= 1, 'Board should have at least 1 task')
    })

    it('should support pagination', async () => {
      const page1 = await adminService.listAllBoards(1, 1)

      assert.strictEqual(page1.data.length, 1)
      assert.ok(page1.meta.total >= 2)
      assert.ok(page1.meta.pages >= 2)
      assert.strictEqual(page1.meta.page, 1)

      const page2 = await adminService.listAllBoards(2, 1)
      assert.strictEqual(page2.meta.page, 2)
    })

    it('should return boards sorted by created_at descending', async () => {
      const result = await adminService.listAllBoards(1, 50)

      for (let i = 0; i < result.data.length - 1; i++) {
        const current = new Date(result.data[i].created_at)
        const next = new Date(result.data[i + 1].created_at)
        assert.ok(current >= next, 'Boards should be sorted by created_at desc')
      }
    })

    it('should convert BigInt IDs to strings', async () => {
      const result = await adminService.listAllBoards(1, 50)

      for (const board of result.data) {
        assert.strictEqual(typeof board.id, 'string', 'Board ID should be string')
        assert.strictEqual(typeof board.owner.id, 'string', 'Owner ID should be string')
      }
    })
  })

  describe('listAllTasks', () => {
    it('should return all tasks with owner and board info', async () => {
      const result = await adminService.listAllTasks({}, 1, 50)

      assert.ok(result.data)
      assert.ok(result.meta)

      // Find our test tasks
      const task1 = result.data.find((t) => t.name === 'Task for User 1')
      const task2 = result.data.find((t) => t.name === 'Task for User 2')

      assert.ok(task1, 'Task 1 should be found')
      assert.ok(task2, 'Task 2 should be found')

      // Verify owner info
      assert.ok(task1.owner, 'Task 1 should have owner')
      assert.strictEqual(task1.owner.emailAddress, testUser1.emailAddress)

      // Verify board info
      assert.ok(task1.board, 'Task 1 should have board')
      assert.strictEqual(task1.board.name, 'User 1 Board')
    })

    it('should support filtering by user_id', async () => {
      const result = await adminService.listAllTasks({ user_id: testUser1.id.toString() }, 1, 50)

      for (const task of result.data) {
        assert.strictEqual(task.owner.id, testUser1.id.toString())
      }
    })

    it('should support filtering by status', async () => {
      const result = await adminService.listAllTasks({ status: 'in_progress' }, 1, 50)

      for (const task of result.data) {
        assert.strictEqual(task.status, 'in_progress')
      }
    })

    it('should support pagination', async () => {
      const page1 = await adminService.listAllTasks({}, 1, 1)

      assert.strictEqual(page1.data.length, 1)
      assert.ok(page1.meta.total >= 2)
      assert.ok(page1.meta.pages >= 2)
    })

    it('should return tasks sorted by created_at descending', async () => {
      const result = await adminService.listAllTasks({}, 1, 50)

      for (let i = 0; i < result.data.length - 1; i++) {
        const current = new Date(result.data[i].created_at)
        const next = new Date(result.data[i + 1].created_at)
        assert.ok(current >= next, 'Tasks should be sorted by created_at desc')
      }
    })

    it('should convert BigInt IDs to strings', async () => {
      const result = await adminService.listAllTasks({}, 1, 50)

      for (const task of result.data) {
        assert.strictEqual(typeof task.id, 'string', 'Task ID should be string')
        assert.strictEqual(typeof task.owner.id, 'string', 'Owner ID should be string')
        assert.strictEqual(typeof task.board.id, 'string', 'Board ID should be string')
      }
    })
  })
})
