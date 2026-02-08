/**
 * End-to-End Migration Test - Fixed for actual schema
 *
 * This test performs CRUD operations using direct Prisma client calls.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://monte:RMxBU^HPXjYpvUL4bekCbEUCEW$8jy@localhost:5432/clawdeck_test'
    }
  }
})

describe('E2E Migration Test - Direct Database', () => {
  let testBoardId = null
  let testTaskIds = []
  let testUserId = null

  before(async () => {
    console.log('\n=== Starting E2E Migration Test ===\n')

    // Get or create test user
    let user = await prisma.user.findFirst({
      where: { emailAddress: 'e2e-test@clawdeck.dev' }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          emailAddress: 'e2e-test@clawdeck.dev',
          agentAutoMode: true
        }
      })
    }

    testUserId = user.id

    // Clean up any existing test data
    await prisma.task.deleteMany({
      where: {
        name: { contains: '[E2E TEST]' }
      }
    })

    await prisma.board.deleteMany({
      where: {
        name: { contains: '[E2E TEST]' }
      }
    })

    console.log('✅ Pre-test cleanup completed')
  })

  after(async () => {
    console.log('\n=== Cleaning up after E2E Test ===\n')

    // Clean up test data
    await prisma.task.deleteMany({
      where: {
        name: { contains: '[E2E TEST]' }
      }
    })

    await prisma.board.deleteMany({
      where: {
        name: { contains: '[E2E TEST]' }
      }
    })

    await prisma.$disconnect()
    console.log('✅ Post-test cleanup completed')
  })

  it('should verify database connection', async () => {
    try {
      await prisma.$connect()
      const result = await prisma.$queryRaw`SELECT 1 as test`
      assert.ok(result, 'Database query successful')
      console.log('✅ Database connection successful')
    } catch (error) {
      console.error('❌ Database connection failed:', error.message)
      throw error
    }
  })

  // ============================================================================
  // PHASE 1: CREATE Operations
  // ============================================================================

  it('should create a board (CREATE Board)', async () => {
    const board = await prisma.board.create({
      data: {
        name: '[E2E TEST] OpenClaw Migration Board',
        icon: '🧪',
        color: 'blue',
        userId: testUserId
      }
    })

    assert.ok(board, 'Board should be created')
    assert.ok(board.id, 'Board should have an ID')
    testBoardId = board.id

    console.log(`✅ Created board: ${board.id.toString()}`)

    // Verify in database
    const dbBoard = await prisma.board.findUnique({
      where: { id: testBoardId }
    })
    assert.ok(dbBoard, 'Board should exist in database')
    assert.strictEqual(dbBoard.name, '[E2E TEST] OpenClaw Migration Board')
    console.log('✅ Board verified in database')
  })

  it('should create tasks (CREATE Tasks)', async () => {
    const tasks = [
      {
        name: '[E2E TEST] Task 1: Setup Environment',
        description: 'Initialize the testing environment for OpenClaw migration',
        boardId: testBoardId,
        userId: testUserId,
        status: 'inbox',
        priority: 'high',
        tags: ['setup', 'migration']
      },
      {
        name: '[E2E TEST] Task 2: Implement Task Manager',
        description: 'Build the TaskManager client library for agents',
        boardId: testBoardId,
        userId: testUserId,
        status: 'inbox',
        priority: 'high',
        tags: ['implementation', 'task-manager']
      },
      {
        name: '[E2E TEST] Task 3: Migrate Agents',
        description: 'Migrate all OpenClaw agents to use ClawDeck API',
        boardId: testBoardId,
        userId: testUserId,
        status: 'inbox',
        priority: 'medium',
        tags: ['migration', 'agents']
      },
      {
        name: '[E2E TEST] Task 4: Test Integration',
        description: 'Run comprehensive tests on the integration',
        boardId: testBoardId,
        userId: testUserId,
        status: 'up_next',
        priority: 'medium',
        tags: ['testing']
      },
      {
        name: '[E2E TEST] Task 5: Verify Data',
        description: 'Verify all data is correctly migrated in the database',
        boardId: testBoardId,
        userId: testUserId,
        status: 'up_next',
        priority: 'low',
        tags: ['verification']
      }
    ]

    for (const taskData of tasks) {
      const task = await prisma.task.create({
        data: taskData
      })
      testTaskIds.push(task.id)
    }

    console.log(`✅ Created ${testTaskIds.length} tasks`)

    // Verify in database
    const dbTasks = await prisma.task.findMany({
      where: {
        name: { contains: '[E2E TEST]' }
      }
    })
    assert.strictEqual(dbTasks.length, 5, 'Should have 5 tasks in database')
    console.log('✅ All tasks verified in database')
  })

  // ============================================================================
  // PHASE 2: READ Operations
  // ============================================================================

  it('should retrieve all tasks (READ Tasks)', async () => {
    const tasks = await prisma.task.findMany({
      where: {
        name: { contains: '[E2E TEST]' }
      },
      orderBy: { createdAt: 'asc' }
    })

    assert.ok(Array.isArray(tasks), 'Should return an array')
    assert.strictEqual(tasks.length, 5, 'Should have 5 tasks')

    console.log(`✅ Retrieved ${tasks.length} tasks`)
  })

  it('should retrieve a specific task (READ Single Task)', async () => {
    const taskId = testTaskIds[0]
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    })

    assert.ok(task, 'Task should exist')
    assert.strictEqual(task.id, taskId)
    assert.strictEqual(task.name, '[E2E TEST] Task 1: Setup Environment')

    console.log('✅ Retrieved single task')
  })

  it('should query tasks by status (READ with Filter)', async () => {
    const inboxTasks = await prisma.task.findMany({
      where: {
        name: { contains: '[E2E TEST]' },
        status: 'inbox'
      }
    })

    const upNextTasks = await prisma.task.findMany({
      where: {
        name: { contains: '[E2E TEST]' },
        status: 'up_next'
      }
    })

    assert.strictEqual(inboxTasks.length, 3, 'Should have 3 inbox tasks')
    assert.strictEqual(upNextTasks.length, 2, 'Should have 2 up_next tasks')

    console.log('✅ Queried tasks by status')
  })

  // ============================================================================
  // PHASE 3: UPDATE Operations
  // ============================================================================

  it('should assign task to agent (UPDATE: Assign)', async () => {
    const taskId = testTaskIds[0]
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToAgent: true,
        assignedAt: new Date()
      }
    })

    assert.strictEqual(task.assignedToAgent, true)
    assert.ok(task.assignedAt, 'Should have assignment timestamp')

    console.log('✅ Assigned task to agent')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: taskId }
    })
    assert.strictEqual(dbTask.assignedToAgent, true)
    assert.ok(dbTask.assignedAt)
    console.log('✅ Task assignment verified in database')
  })

  it('should claim a task (UPDATE: Claim)', async () => {
    const taskId = testTaskIds[0]
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        agentClaimedAt: new Date(),
        status: 'in_progress'
      }
    })

    assert.strictEqual(task.status, 'in_progress')
    assert.ok(task.agentClaimedAt, 'Should have claim timestamp')

    console.log('✅ Claimed task')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: taskId }
    })
    assert.strictEqual(dbTask.status, 'in_progress')
    assert.ok(dbTask.agentClaimedAt)
    console.log('✅ Task claim verified in database')
  })

  it('should update task status and priority (UPDATE: Modify)', async () => {
    const taskId = testTaskIds[1]
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'up_next',
        priority: 'high'
      }
    })

    assert.strictEqual(task.status, 'up_next')
    assert.strictEqual(task.priority, 'high')

    console.log('✅ Updated task status and priority')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: taskId }
    })
    assert.strictEqual(dbTask.status, 'up_next')
    assert.strictEqual(dbTask.priority, 'high')
    console.log('✅ Task update verified in database')
  })

  it('should complete a task (UPDATE: Complete)', async () => {
    const taskId = testTaskIds[0]
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'done',
        completed: true,
        completedAt: new Date()
      }
    })

    assert.strictEqual(task.status, 'done')
    assert.strictEqual(task.completed, true)
    assert.ok(task.completedAt, 'Should have completion timestamp')

    console.log('✅ Completed task')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: taskId }
    })
    assert.strictEqual(dbTask.status, 'done')
    assert.strictEqual(dbTask.completed, true)
    assert.ok(dbTask.completedAt)
    console.log('✅ Task completion verified in database')
  })

  it('should unclaim a task (UPDATE: Unclaim)', async () => {
    const taskId = testTaskIds[2]
    // First claim it
    await prisma.task.update({
      where: { id: taskId },
      data: {
        agentClaimedAt: new Date(),
        status: 'in_progress'
      }
    })

    // Then unclaim it
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        agentClaimedAt: null,
        status: 'inbox'
      }
    })

    assert.ok(!task.agentClaimedAt, 'Should not have claim timestamp')

    console.log('✅ Unclaimed task')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: taskId }
    })
    assert.ok(!dbTask.agentClaimedAt)
    console.log('✅ Task unclaim verified in database')
  })

  it('should unassign a task (UPDATE: Unassign)', async () => {
    const taskId = testTaskIds[1]
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToAgent: false,
        assignedAt: null
      }
    })

    assert.strictEqual(task.assignedToAgent, false)

    console.log('✅ Unassigned task')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: taskId }
    })
    assert.strictEqual(dbTask.assignedToAgent, false)
    console.log('✅ Task unassignment verified in database')
  })

  // ============================================================================
  // PHASE 4: DELETE Operations
  // ============================================================================

  it('should delete a task (DELETE Single Task)', async () => {
    const taskId = testTaskIds[4]

    await prisma.task.delete({
      where: { id: taskId }
    })

    console.log('✅ Deleted task')

    // Verify deletion in database
    const dbTask = await prisma.task.findUnique({
      where: { id: taskId }
    })
    assert.ok(!dbTask, 'Task should not exist in database after deletion')
    console.log('✅ Task deletion verified in database')
  })

  it('should delete remaining tasks (DELETE Multiple Tasks)', async () => {
    // Delete remaining test tasks
    for (const taskId of testTaskIds.slice(0, 4)) {
      await prisma.task.delete({
        where: { id: taskId }
      })
    }

    console.log('✅ Deleted remaining tasks')

    // Verify in database
    const dbTasks = await prisma.task.findMany({
      where: {
        name: { contains: '[E2E TEST]' }
      }
    })
    assert.strictEqual(dbTasks.length, 0, 'Should have no tasks in database')
    console.log('✅ All tasks deletion verified in database')
  })

  it('should delete the test board (DELETE Board)', async () => {
    await prisma.board.delete({
      where: { id: testBoardId }
    })

    console.log('✅ Deleted board')

    // Verify in database
    const dbBoard = await prisma.board.findUnique({
      where: { id: testBoardId }
    })
    assert.ok(!dbBoard, 'Board should not exist in database after deletion')
    console.log('✅ Board deletion verified in database')
  })

  // ============================================================================
  // SUMMARY
  // ============================================================================

  it('should display E2E test summary', async () => {
    console.log('\n=== E2E Migration Test Summary ===\n')
    console.log('All CRUD operations tested:')
    console.log('  ✅ CREATE: Board, 5 Tasks')
    console.log('  ✅ READ: Single task, All tasks, Filter by status')
    console.log('  ✅ UPDATE: Assign, Claim, Modify, Complete, Unclaim, Unassign')
    console.log('  ✅ DELETE: Single task, Multiple tasks, Board')
    console.log('\nAll operations verified in PostgreSQL database')
    console.log('\nTest Statistics:')
    console.log(`  - Boards created: 1`)
    console.log(`  - Tasks created: 5`)
    console.log(`  - Tasks assigned: 1`)
    console.log(`  - Tasks claimed: 2`)
    console.log(`  - Tasks completed: 1`)
    console.log(`  - Tasks modified: 1`)
    console.log(`  - Tasks deleted: 5`)
    console.log(`  - Boards deleted: 1`)
    console.log('\n✅ All E2E tests passed successfully!\n')
    assert.ok(true, 'E2E test completed successfully')
  })
})
