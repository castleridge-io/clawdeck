import { describe, it, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'
import { archiveScheduler } from '../../src/services/archiveScheduler.js'
import { wsManager } from '../../src/websocket/manager.js'
let restoreStubs = []

function stubMethod (obj, methodName, implementation) {
  const original = obj[methodName]
  obj[methodName] = implementation
  restoreStubs.push(() => {
    obj[methodName] = original
  })
}

function makeTask (overrides = {}) {
  return {
    id: 101n,
    name: 'Task',
    description: null,
    status: 'done',
    priority: 'none',
    position: 0,
    boardId: 5n,
    userId: 1n,
    completed: true,
    completedAt: new Date('2026-01-01T00:00:00.000Z'),
    archived: false,
    archivedAt: null,
    archiveScheduled: false,
    archiveScheduledAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeTaskWithBoard (overrides = {}) {
  return {
    ...makeTask(overrides),
    board: { userId: 1n },
  }
}

describe('Archive Scheduler Service', () => {
  beforeEach(() => {
    mock.restoreAll()
    archiveScheduler.stop()
    process.env.ARCHIVE_ENABLED = 'true'
    restoreStubs = []

    stubMethod(prisma.task, 'findMany', async () => [])
    stubMethod(prisma.task, 'update', async ({ where }) => {
      return makeTask({
        id: where.id,
        archived: true,
        archivedAt: new Date(),
        archiveScheduled: false,
        archiveScheduledAt: null,
      })
    })
    stubMethod(prisma.task, 'findUnique', async () => null)
    stubMethod(prisma.taskActivity, 'create', async () => ({ id: 1n }))
    mock.method(wsManager, 'broadcastTaskEvent', () => {})
  })

  afterEach(() => {
    archiveScheduler.stop()
    mock.restoreAll()
    for (const restore of restoreStubs) {
      restore()
    }
    delete process.env.ARCHIVE_ENABLED
  })

  describe('start()', () => {
    it('should start the scheduler when enabled', () => {
      const runMock = mock.method(archiveScheduler, 'run', async () => {})
      archiveScheduler.start()

      assert.strictEqual(archiveScheduler.isRunning, true)
      assert.strictEqual(runMock.mock.callCount(), 1)
    })

    it('should not start when disabled', () => {
      process.env.ARCHIVE_ENABLED = 'false'
      const runMock = mock.method(archiveScheduler, 'run', async () => {})
      archiveScheduler.start()

      assert.strictEqual(archiveScheduler.isRunning, false)
      assert.strictEqual(runMock.mock.callCount(), 0)
    })

    it('should be idempotent when already running', () => {
      const runMock = mock.method(archiveScheduler, 'run', async () => {})
      archiveScheduler.start()
      const wasRunning = archiveScheduler.isRunning
      archiveScheduler.start()
      const stillRunning = archiveScheduler.isRunning

      assert.strictEqual(wasRunning, stillRunning)
      assert.strictEqual(stillRunning, true)
      assert.strictEqual(runMock.mock.callCount(), 1)
    })
  })

  describe('stop()', () => {
    it('should stop a running scheduler', () => {
      mock.method(archiveScheduler, 'run', async () => {})
      archiveScheduler.start()
      assert.strictEqual(archiveScheduler.isRunning, true)

      archiveScheduler.stop()
      assert.strictEqual(archiveScheduler.isRunning, false)
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
      const baseTask = makeTaskWithBoard({ id: 301n, name: 'Task to Immediate Archive' })
      const archivedTask = makeTask({ id: 301n, name: 'Task to Immediate Archive', archived: true, archivedAt: new Date() })

      let findUniqueCalls = 0
      stubMethod(prisma.task, 'findUnique', async () => {
        findUniqueCalls += 1
        return findUniqueCalls === 1 ? baseTask : archivedTask
      })

      const result = await archiveScheduler.scheduleImmediateArchive('301')

      assert.strictEqual(result.archived, true)
      assert.ok(result.archived_at)
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
      stubMethod(prisma.task, 'findUnique', async () => makeTaskWithBoard({ id: 302n, status: 'in_progress', completed: false }))

      await assert.rejects(
        async () => {
          await archiveScheduler.scheduleImmediateArchive('302')
        },
        { message: 'Only completed tasks can be archived' }
      )
    })

    it('should throw error for already archived task', async () => {
      stubMethod(prisma.task, 'findUnique', async () => makeTaskWithBoard({ id: 303n, archived: true, archivedAt: new Date() }))

      await assert.rejects(
        async () => {
          await archiveScheduler.scheduleImmediateArchive('303')
        },
        { message: 'Task is already archived' }
      )
    })
  })

  describe('run() - scheduled archiving', () => {
    it('should archive tasks older than the delay period', async () => {
      const oldTask = makeTaskWithBoard({ id: 401n, name: 'Old Task for Scheduled Archive' })
      let findManyCalls = 0
      let updateCalls = 0
      stubMethod(prisma.task, 'findMany', async () => {
        findManyCalls += 1
        return [oldTask]
      })
      stubMethod(prisma.task, 'update', async () => {
        updateCalls += 1
        return makeTask({ id: 401n, archived: true, archivedAt: new Date() })
      })

      await archiveScheduler.run()
      assert.strictEqual(findManyCalls, 1)
      assert.strictEqual(updateCalls, 1)
    })

    it('should not archive recent completed tasks', async () => {
      let findManyCalls = 0
      let updateCalls = 0
      stubMethod(prisma.task, 'findMany', async () => {
        findManyCalls += 1
        return []
      })
      stubMethod(prisma.task, 'update', async () => {
        updateCalls += 1
        return makeTask({ archived: true, archivedAt: new Date() })
      })

      await archiveScheduler.run()
      assert.strictEqual(findManyCalls, 1)
      assert.strictEqual(updateCalls, 0)
    })

    it('should create activity record for archived tasks', async () => {
      const oldTask = makeTaskWithBoard({ id: 402n, name: 'Task with Activity Record' })
      stubMethod(prisma.task, 'findMany', async () => [oldTask])
      let activityCalls = 0
      let activityArgs = null
      stubMethod(prisma.taskActivity, 'create', async (args) => {
        activityCalls += 1
        activityArgs = args
        return { id: 2n }
      })
      await archiveScheduler.run()
      assert.strictEqual(activityCalls, 1)
      assert.strictEqual(activityArgs.data.action, 'archived')
      assert.strictEqual(activityArgs.data.fieldName, 'archived')
      assert.strictEqual(activityArgs.data.oldValue, 'false')
      assert.strictEqual(activityArgs.data.newValue, 'true')
    })
  })

  describe('taskToJson()', () => {
    it('should convert task to JSON with archive fields', async () => {
      const task = makeTask({
        id: 501n,
        name: 'JSON Test Task',
        archived: true,
        archivedAt: new Date(),
        completedAt: new Date(),
      })

      const json = archiveScheduler.taskToJson(task)

      assert.strictEqual(json.id, task.id.toString())
      assert.strictEqual(json.name, 'JSON Test Task')
      assert.strictEqual(json.archived, true)
      assert.ok(json.archived_at)
      assert.strictEqual(json.board_id, task.boardId.toString())
    })
  })
})
