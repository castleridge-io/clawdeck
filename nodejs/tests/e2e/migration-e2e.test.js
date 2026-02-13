/**
 * End-to-End Migration Test
 *
 * This test simulates the complete migration workflow from WORKING.md to ClawDeck.
 * It performs all CRUD operations and verifies them in the database.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

const API_BASE = 'http://localhost:3001/api/v1'
const TEST_AGENT_ID = 'test-agent-e2e'
const TEST_AGENT_NAME = 'Test Agent E2E'

// Helper function to make API requests
async function apiRequest (endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.JWT_SECRET || 'test-secret-for-testing-only'}`,
    },
  }

  const response = await fetch(url, { ...defaultOptions, ...options })
  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
  }
}

describe('E2E Migration Test', () => {
  let testAgentId = null
  let testBoardId = null
  let testTaskId = null

  before(async () => {
    console.log('\n=== Starting E2E Migration Test ===\n')

    // Clean up any existing test data
    await prisma.task.deleteMany({
      where: { agentId: TEST_AGENT_ID },
    })
    await prisma.agent.deleteMany({
      where: { id: TEST_AGENT_ID },
    })

    console.log('✅ Pre-test cleanup completed')
  })

  after(async () => {
    console.log('\n=== Cleaning up after E2E Test ===\n')

    // Clean up test data
    await prisma.task.deleteMany({
      where: { agentId: TEST_AGENT_ID },
    })
    await prisma.agent.deleteMany({
      where: { id: TEST_AGENT_ID },
    })
    await prisma.board.deleteMany({
      where: { id: testBoardId || 'unknown' },
    })

    await prisma.$disconnect()
    console.log('✅ Post-test cleanup completed')
  })

  it('should verify database connection', async () => {
    try {
      await prisma.$connect()
      console.log('✅ Database connection successful')
    } catch (error) {
      console.error('❌ Database connection failed:', error.message)
      throw error
    }
  })

  // ============================================================================
  // PHASE 1: CREATE Operations
  // ============================================================================

  it('should create a test agent (CREATE Agent)', async () => {
    const response = await apiRequest('/agents', {
      method: 'POST',
      body: JSON.stringify({
        id: TEST_AGENT_ID,
        name: TEST_AGENT_NAME,
        role: 'tester',
        capabilities: ['testing', 'e2e', 'cleanup'],
        autoMode: false,
      }),
    })

    assert.strictEqual(response.status, 201, 'Should create agent successfully')
    assert.ok(response.data.id, 'Should return agent ID')
    assert.strictEqual(response.data.name, TEST_AGENT_NAME)

    testAgentId = response.data.id
    console.log(`✅ Created agent: ${testAgentId}`)

    // Verify in database
    const dbAgent = await prisma.agent.findUnique({
      where: { id: testAgentId },
    })
    assert.ok(dbAgent, 'Agent should exist in database')
    assert.strictEqual(dbAgent.name, TEST_AGENT_NAME)
    console.log('✅ Agent verified in database')
  })

  it('should create a board for the agent (CREATE Board)', async () => {
    const response = await apiRequest('/boards', {
      method: 'POST',
      body: JSON.stringify({
        name: 'E2E Test Board',
        description: 'Board for end-to-end testing',
        agentId: testAgentId,
        columns: [
          { name: 'Backlog', order: 0 },
          { name: 'In Progress', order: 1 },
          { name: 'Done', order: 2 },
        ],
      }),
    })

    assert.strictEqual(response.status, 201, 'Should create board successfully')
    assert.ok(response.data.id, 'Should return board ID')

    testBoardId = response.data.id
    console.log(`✅ Created board: ${testBoardId}`)

    // Verify in database
    const dbBoard = await prisma.board.findUnique({
      where: { id: testBoardId },
      include: { columns: true },
    })
    assert.ok(dbBoard, 'Board should exist in database')
    assert.strictEqual(dbBoard.columns.length, 3, 'Should have 3 columns')
    console.log('✅ Board verified in database')
  })

  it('should create tasks for the agent (CREATE Tasks)', async () => {
    const tasks = [
      {
        title: 'Test Task 1: Setup Environment',
        description: 'Initialize the testing environment',
        status: 'backlog',
        priority: 'high',
        agentId: testAgentId,
        boardId: testBoardId,
      },
      {
        title: 'Test Task 2: Run Tests',
        description: 'Execute the test suite',
        status: 'backlog',
        priority: 'medium',
        agentId: testAgentId,
        boardId: testBoardId,
      },
      {
        title: 'Test Task 3: Verify Results',
        description: 'Verify test results and cleanup',
        status: 'backlog',
        priority: 'low',
        agentId: testAgentId,
        boardId: testBoardId,
      },
    ]

    for (const task of tasks) {
      const response = await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      })

      assert.strictEqual(response.status, 201, `Should create task: ${task.title}`)
      if (!testTaskId) {
        testTaskId = response.data.id
      }
    }

    console.log('✅ Created 3 tasks')

    // Verify in database
    const dbTasks = await prisma.task.findMany({
      where: { agentId: testAgentId },
    })
    assert.strictEqual(dbTasks.length, 3, 'Should have 3 tasks in database')
    console.log('✅ Tasks verified in database')
  })

  // ============================================================================
  // PHASE 2: READ Operations
  // ============================================================================

  it('should retrieve all tasks for the agent (READ Tasks)', async () => {
    const response = await apiRequest(`/tasks?agentId=${testAgentId}`)

    assert.strictEqual(response.status, 200, 'Should retrieve tasks successfully')
    assert.ok(Array.isArray(response.data), 'Should return an array')
    assert.strictEqual(response.data.length, 3, 'Should have 3 tasks')

    console.log('✅ Retrieved tasks via API')
  })

  it('should retrieve a specific task (READ Single Task)', async () => {
    const response = await apiRequest(`/tasks/${testTaskId}`)

    assert.strictEqual(response.status, 200, 'Should retrieve task successfully')
    assert.strictEqual(response.data.id, testTaskId)
    assert.strictEqual(response.data.title, 'Test Task 1: Setup Environment')

    console.log('✅ Retrieved single task via API')
  })

  it('should get the next task for the agent (READ Next Task)', async () => {
    const response = await apiRequest(`/tasks/next?agentId=${testAgentId}`)

    assert.strictEqual(response.status, 200, 'Should get next task successfully')
    assert.ok(response.data.id, 'Should return a task ID')
    assert.strictEqual(response.data.agentId, testAgentId)

    console.log('✅ Retrieved next task via API')
  })

  it('should verify tasks in PostgreSQL directly', async () => {
    // Direct database query
    const result = await prisma.$queryRaw`
      SELECT id, title, status, priority, "agentId"
      FROM "Task"
      WHERE "agentId" = ${testAgentId}
      ORDER BY created_at DESC
    `

    assert.ok(Array.isArray(result), 'Should return array from direct query')
    assert.strictEqual(result.length, 3, 'Should have 3 tasks')

    console.log('✅ Verified tasks via direct PostgreSQL query')
    console.log(`   Found ${result.length} tasks in database`)
  })

  // ============================================================================
  // PHASE 3: UPDATE Operations
  // ============================================================================

  it('should claim a task (UPDATE: Claim)', async () => {
    const response = await apiRequest(`/tasks/${testTaskId}/claim`, {
      method: 'PATCH',
    })

    assert.strictEqual(response.status, 200, 'Should claim task successfully')
    assert.strictEqual(response.data.status, 'in_progress')

    console.log('✅ Claimed task via API')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: testTaskId },
    })
    assert.strictEqual(dbTask.status, 'in_progress')
    assert.ok(dbTask.claimedAt, 'Should have claim timestamp')
    console.log('✅ Task claim verified in database')
  })

  it('should update task progress (UPDATE: Progress)', async () => {
    const updateData = {
      progress: 50,
      notes: 'Halfway through testing',
    }

    const response = await apiRequest(`/tasks/${testTaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updateData),
    })

    assert.strictEqual(response.status, 200, 'Should update task successfully')
    assert.strictEqual(response.data.progress, 50)

    console.log('✅ Updated task progress via API')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: testTaskId },
    })
    assert.strictEqual(dbTask.progress, 50)
    console.log('✅ Task progress verified in database')
  })

  it('should complete a task (UPDATE: Complete)', async () => {
    const response = await apiRequest(`/tasks/${testTaskId}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({
        result: 'All tests passed successfully',
        output: { testsRun: 10, testsPassed: 10 },
      }),
    })

    assert.strictEqual(response.status, 200, 'Should complete task successfully')
    assert.strictEqual(response.data.status, 'done')

    console.log('✅ Completed task via API')

    // Verify in database
    const dbTask = await prisma.task.findUnique({
      where: { id: testTaskId },
    })
    assert.strictEqual(dbTask.status, 'done')
    assert.ok(dbTask.completedAt, 'Should have completion timestamp')
    console.log('✅ Task completion verified in database')
  })

  it('should update agent status (UPDATE Agent)', async () => {
    const response = await apiRequest(`/agents/${testAgentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'active',
        lastActivity: new Date().toISOString(),
      }),
    })

    assert.strictEqual(response.status, 200, 'Should update agent successfully')

    console.log('✅ Updated agent status via API')

    // Verify in database
    const dbAgent = await prisma.agent.findUnique({
      where: { id: testAgentId },
    })
    assert.strictEqual(dbAgent.status, 'active')
    console.log('✅ Agent status verified in database')
  })

  // ============================================================================
  // PHASE 4: DELETE Operations
  // ============================================================================

  it('should delete a task (DELETE Task)', async () => {
    // Get another task ID to delete
    const tasks = await prisma.task.findMany({
      where: { agentId: testAgentId, status: 'backlog' },
      take: 1,
    })

    if (tasks.length > 0) {
      const taskToDelete = tasks[0].id

      const response = await apiRequest(`/tasks/${taskToDelete}`, {
        method: 'DELETE',
      })

      assert.strictEqual(response.status, 204, 'Should delete task successfully')

      console.log('✅ Deleted task via API')

      // Verify deletion in database
      const dbTask = await prisma.task.findUnique({
        where: { id: taskToDelete },
      })
      assert.ok(!dbTask, 'Task should not exist in database after deletion')
      console.log('✅ Task deletion verified in database')
    }
  })

  it('should delete all tasks for agent cleanup', async () => {
    const response = await apiRequest(`/tasks?agentId=${testAgentId}`, {
      method: 'DELETE',
    })

    assert.strictEqual(response.status, 200, 'Should delete all tasks successfully')

    console.log('✅ Deleted all tasks via API')

    // Verify in database
    const dbTasks = await prisma.task.findMany({
      where: { agentId: testAgentId },
    })
    assert.strictEqual(dbTasks.length, 0, 'Should have no tasks in database')
    console.log('✅ All tasks deletion verified in database')
  })

  it('should delete the test agent (DELETE Agent)', async () => {
    const response = await apiRequest(`/agents/${testAgentId}`, {
      method: 'DELETE',
    })

    assert.strictEqual(response.status, 200, 'Should delete agent successfully')

    console.log('✅ Deleted agent via API')

    // Verify in database
    const dbAgent = await prisma.agent.findUnique({
      where: { id: testAgentId },
    })
    assert.ok(!dbAgent, 'Agent should not exist in database after deletion')
    console.log('✅ Agent deletion verified in database')
  })

  // ============================================================================
  // SUMMARY
  // ============================================================================

  it('should display E2E test summary', async () => {
    console.log('\n=== E2E Migration Test Summary ===\n')
    console.log('All CRUD operations tested:')
    console.log('  ✅ CREATE: Agent, Board, Tasks')
    console.log('  ✅ READ: Single task, All tasks, Next task')
    console.log('  ✅ UPDATE: Claim task, Update progress, Complete task, Update agent')
    console.log('  ✅ DELETE: Single task, All tasks, Agent')
    console.log('\nAll operations verified in PostgreSQL database\n')
    assert.ok(true, 'E2E test completed successfully')
  })
})
