import { describe, it, mock, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'
import { archiveScheduler } from '../../src/services/archiveScheduler.js'

// Test utilities
let testUser
let testBoard
let testTasks = []

async function setupTestEnvironment() {
  // Create test user
  testUser = await prisma.user.create({
    data: {
      emailAddress: `test-archive-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖'
    }
  })

  // Create test board
  testBoard = await prisma.board.create({
    data: {
      name: 'Test Archive Board',
      userId: testUser.id,
      position: 0
    }
  })

  // Create test tasks with various completion dates
  const now = new Date()
  const oldDate = new Date(now.getTime() - 25 * 60 * 60 * 1000) // 25 hours ago

  testTasks = await Promise.all([
    // Old completed task (should be archived)
    prisma.task.create({
      data: {
        name: 'Old Completed Task',
        boardId: testBoard.id,
        userId: testUser.id,
        status: 'done',
        completed: true,
        completedAt: oldDate
      }
    }),
    // Recent completed task (should NOT be archived)
    prisma.task.create({
      data: {
        name: 'Recent Completed Task',
        boardId: testBoard.id,
        userId: testUser.id,
        status: 'done',
        completed: true,
        completedAt: now
      }
    }),
    // Incomplete task (should NOT be archived)
    prisma.task.create({
      data: {
        name: 'Incomplete Task',
        boardId: testBoard.id,
        userId: testUser.id,
        status: 'in_progress'
      }
    })
  ])
}

async function cleanupTestEnvironment() {
  await prisma.taskActivity.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.user.deleteMany({})
  testTasks = []
}

describe('Archive Scheduler Service', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    // Stop scheduler if running
    archiveScheduler.stop()
    await cleanupTestEnvironment()
  })

  describe('start()', () => {
    it('should start the scheduler when enabled', () => {
      const originalEnabled = process.env.ARCHIVE_ENABLED
      process.env.ARCHIVE_ENABLED = 'true'

      archiveScheduler.stop() // Reset state
      archiveScheduler.start()

      assert.strictEqual(archiveScheduler.isRunning, true)

      process.env.ARCHIVE_ENABLED = originalEnabled
    })

    it('should not start when disabled', () => {
      const originalEnabled = process.env.ARCHIVE_ENABLED
      process.env.ARCHIVE_ENABLED = 'false'

      archiveScheduler.stop() // Reset state
      archiveScheduler.start()

      assert.strictEqual(archiveScheduler.isRunning, false)

      process.env.ARCHIVE_ENABLED = originalEnabled
    })

    it('should be idempotent when already running', () => {
      const originalEnabled = process.env.ARCHIVE_ENABLED
      process.env.ARCHIVE_ENABLED = 'true'

      archiveScheduler.start()
      const wasRunning = archiveScheduler.isRunning
      archiveScheduler.start()
      const stillRunning = archiveScheduler.isRunning

      assert.strictEqual(wasRunning, stillRunning)
      assert.strictEqual(stillRunning, true)

      process.env.ARCHIVE_ENABLED = originalEnabled
    })
  })

  describe('stop()', () => {
    it('should stop a running scheduler', () => {
      const originalEnabled = process.env.ARCHIVE_ENABLED
      process.env.ARCHIVE_ENABLED = 'true'

      archiveScheduler.start()
      assert.strictEqual(archiveScheduler.isRunning, true)

      archiveScheduler.stop()
      assert.strictEqual(archiveScheduler.isRunning, false)

      process.env.ARCHIVE_ENABLED = originalEnabled
    })

    it('should be safe to call when not running', () => {
      archiveScheduler.stop()
      assert.strictEqual(archiveScheduler.isRunning, false)
      archiveScheduler.stop()
      assert.strictEqual(archiveScheduler.isRunning, false)
    })
  })

  describe('scheduleImmediateArchive()', () => {
    it('should archive a completed task immediately', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Task to Immediate Archive',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: new Date()
        }
      })

      const result = await archiveScheduler.scheduleImmediateArchive(task.id.toString())

      assert.strictEqual(result.archived, true)
      assert.ok(result.archived_at)

      // Verify in database
      const archivedTask = await prisma.task.findUnique({
        where: { id: task.id }
      })
      assert.strictEqual(archivedTask.archived, true)
      assert.ok(archivedTask.archivedAt)
    })

    it('should throw error for non-existent task', async () => {
      await assert.rejects(
        async () => {
          await archiveScheduler.scheduleImmediateArchive('999999999')
        },
        { message: 'Task not found' }
      )
    })

    it('should throw error for incomplete task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Incomplete Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'in_progress'
        }
      })

      await assert.rejects(
        async () => {
          await archiveScheduler.scheduleImmediateArchive(task.id.toString())
        },
        { message: 'Only completed tasks can be archived' }
      )
    })

    it('should throw error for already archived task', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Already Archived Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: new Date(),
          archived: true,
          archivedAt: new Date()
        }
      })

      await assert.rejects(
        async () => {
          await archiveScheduler.scheduleImmediateArchive(task.id.toString())
        },
        { message: 'Task is already archived' }
      )
    })
  })

  describe('run() - scheduled archiving', () => {
    it('should archive tasks older than the delay period', async () => {
      // Create an old completed task
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      const task = await prisma.task.create({
        data: {
          name: 'Old Task for Scheduled Archive',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: oldDate
        }
      })

      // Run the scheduler
      await archiveScheduler.run()

      // Verify the task was archived
      const archivedTask = await prisma.task.findUnique({
        where: { id: task.id }
      })
      assert.strictEqual(archivedTask.archived, true)
      assert.ok(archivedTask.archivedAt)
    })

    it('should not archive recent completed tasks', async () => {
      // Create a recent completed task
      const task = await prisma.task.create({
        data: {
          name: 'Recent Task Should Not Archive',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: new Date()
        }
      })

      // Run the scheduler
      await archiveScheduler.run()

      // Verify the task was NOT archived
      const notArchivedTask = await prisma.task.findUnique({
        where: { id: task.id }
      })
      assert.strictEqual(notArchivedTask.archived, false)
    })

    it('should create activity record for archived tasks', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000)
      const task = await prisma.task.create({
        data: {
          name: 'Task with Activity Record',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: oldDate
        }
      })

      await archiveScheduler.run()

      const activities = await prisma.taskActivity.findMany({
        where: { taskId: task.id }
      })

      assert.ok(activities.length > 0)
      const archiveActivity = activities.find(a => a.action === 'archived')
      assert.ok(archiveActivity)
      assert.strictEqual(archiveActivity.fieldName, 'archived')
      assert.strictEqual(archiveActivity.oldValue, 'false')
      assert.strictEqual(archiveActivity.newValue, 'true')
    })
  })

  describe('taskToJson()', () => {
    it('should convert task to JSON with archive fields', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'JSON Test Task',
          boardId: testBoard.id,
          userId: testUser.id,
          status: 'done',
          completed: true,
          completedAt: new Date(),
          archived: true,
          archivedAt: new Date()
        }
      })

      const json = archiveScheduler.taskToJson(task)

      assert.strictEqual(json.id, task.id.toString())
      assert.strictEqual(json.name, 'JSON Test Task')
      assert.strictEqual(json.archived, true)
      assert.ok(json.archived_at)
      assert.strictEqual(json.board_id, testBoard.id.toString())
    })
  })
})

export { setupTestEnvironment, cleanupTestEnvironment }
