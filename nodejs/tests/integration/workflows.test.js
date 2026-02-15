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
      emailAddress: `workflow-test-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖',
    },
  })

  // Create test API token
  testToken = `cd_workflow_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await prisma.apiToken.create({
    data: {
      token: testToken,
      name: 'Workflow Test Token',
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

describe('Workflows API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('POST /api/v1/workflows', () => {
    it('should create a new workflow', async () => {
      const result = await makeRequest('POST', '/api/v1/workflows', {
        name: 'feature-dev',
        description: 'Feature development workflow',
        steps: [
          {
            stepId: 'plan',
            agentId: 'planner',
            inputTemplate: 'Create a plan for: {task}',
            expects: 'plan',
          },
          {
            stepId: 'implement',
            agentId: 'developer',
            inputTemplate: 'Implement: {task}',
            expects: 'code',
          },
        ],
      })

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.name, 'feature-dev')
      assert.strictEqual(result.data.data.description, 'Feature development workflow')
      assert.ok(result.data.data.id)
    })

    it('should require workflow name', async () => {
      const result = await makeRequest('POST', '/api/v1/workflows', {
        description: 'Workflow without name',
      })

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'name is required')
    })

    it('should validate steps is an array', async () => {
      const result = await makeRequest('POST', '/api/v1/workflows', {
        name: 'test-workflow',
        steps: 'invalid',
      })

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'steps must be an array')
    })
  })

  describe('GET /api/v1/workflows', () => {
    it('should return empty array when no workflows exist', async () => {
      // First clean up any existing workflows
      await prisma.workflow.deleteMany({})

      const result = await makeRequest('GET', '/api/v1/workflows')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.deepStrictEqual(result.data.data, [])
    })

    it('should return list of workflows', async () => {
      // Create test workflows
      await prisma.workflow.create({
        data: {
          name: 'bug-fix',
          description: 'Bug fix workflow',
          config: { steps: [] },
        },
      })

      const result = await makeRequest('GET', '/api/v1/workflows')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(Array.isArray(result.data.data))
      assert.ok(result.data.data.length >= 1)
      assert.ok(result.data.data.some((w) => w.name === 'bug-fix'))
    })
  })

  describe('GET /api/v1/workflows/:id', () => {
    it('should return a single workflow', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          name: 'code-review',
          description: 'Code review workflow',
          config: { steps: [] },
        },
      })

      const result = await makeRequest('GET', `/api/v1/workflows/${workflow.id}`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.id, workflow.id.toString())
      assert.strictEqual(result.data.data.name, 'code-review')
    })

    it('should return 404 for non-existent workflow', async () => {
      const result = await makeRequest('GET', '/api/v1/workflows/999999999')

      assert.strictEqual(result.status, 404)
      assert.strictEqual(result.data.error, 'Workflow not found')
    })
  })

  describe('DELETE /api/v1/workflows/:id', () => {
    it('should delete a workflow', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          name: 'temp-workflow',
          description: 'Temporary workflow',
          config: { steps: [] },
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/workflows/${workflow.id}`)

      assert.strictEqual(result.status, 204)

      // Verify deletion
      const deleted = await prisma.workflow.findUnique({
        where: { id: workflow.id },
      })
      assert.strictEqual(deleted, null)
    })

    it('should return 404 for non-existent workflow', async () => {
      const result = await makeRequest('DELETE', '/api/v1/workflows/999999999')

      assert.strictEqual(result.status, 404)
    })
  })
})

describe('Task Creation with Workflow', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  it('should auto-create Run when task created with workflow_type', async () => {
    // First create a workflow
    const workflowResult = await makeRequest('POST', '/api/v1/workflows', {
      name: 'feature-dev',
      description: 'Feature development',
      steps: [
        {
          stepId: 'plan',
          agentId: 'planner',
          inputTemplate: 'Plan: {task}',
          expects: 'plan',
        },
      ],
    })

    assert.strictEqual(workflowResult.status, 201)

    // Create task with workflow_type
    const taskResult = await makeRequest('POST', '/api/v1/tasks', {
      name: 'Build new feature',
      description: 'Build a new feature',
      board_id: testBoard.id.toString(),
      workflow_type: 'feature-dev',
    })

    assert.strictEqual(taskResult.status, 201)
    assert.strictEqual(taskResult.data.name, 'Build new feature')
    assert.strictEqual(taskResult.data.workflow_type, 'feature-dev')
    assert.ok(taskResult.data.workflow_run_id, 'Run ID should be set on task')

    // Verify Run was created
    const runResult = await makeRequest('GET', `/api/v1/runs/${taskResult.data.workflow_run_id}`)
    assert.strictEqual(runResult.status, 200)
    assert.strictEqual(runResult.data.data.status, 'running')
    assert.strictEqual(runResult.data.data.taskId, taskResult.data.id)
  })

  it('should not create Run when workflow_type is not provided', async () => {
    const taskResult = await makeRequest('POST', '/api/v1/tasks', {
      name: 'Simple task',
      description: 'Task without workflow',
      board_id: testBoard.id.toString(),
    })

    assert.strictEqual(taskResult.status, 201)
    assert.strictEqual(taskResult.data.name, 'Simple task')
    assert.strictEqual(taskResult.data.workflow_type, null)
    assert.strictEqual(taskResult.data.workflow_run_id, null)
  })

  it('should return 400 when workflow_type does not exist', async () => {
    const taskResult = await makeRequest('POST', '/api/v1/tasks', {
      name: 'Invalid workflow task',
      description: 'Task with non-existent workflow',
      board_id: testBoard.id.toString(),
      workflow_type: 'non-existent-workflow',
    })

    assert.strictEqual(taskResult.status, 400)
    assert.strictEqual(taskResult.data.error, 'Workflow not found')
  })
})

describe('Runs API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('GET /api/v1/runs/:id', () => {
    it('should return a single run', async () => {
      // Create workflow first
      const workflow = await prisma.workflow.create({
        data: {
          name: 'test-run-workflow',
          description: 'Test workflow',
          config: { steps: [] },
        },
      })

      // Create task
      const task = await prisma.task.create({
        data: {
          name: 'Test Task',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      // Create run
      const run = await prisma.run.create({
        data: {
          id: `run-${Date.now()}`,
          workflowId: workflow.id.toString(),
          taskId: task.id.toString(),
          task: 'Test task description',
          status: 'running',
          context: '{}',
        },
      })

      const result = await makeRequest('GET', `/api/v1/runs/${run.id}`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.id, run.id)
      assert.strictEqual(result.data.data.status, 'running')
    })

    it('should return 404 for non-existent run', async () => {
      const result = await makeRequest('GET', '/api/v1/runs/non-existent-id')

      assert.strictEqual(result.status, 404)
      assert.strictEqual(result.data.error, 'Run not found')
    })
  })

  describe('PATCH /api/v1/runs/:id/status', () => {
    it('should update run status', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          name: 'status-update-workflow',
          description: 'Test workflow',
          config: { steps: [] },
        },
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task for Status',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await prisma.run.create({
        data: {
          id: `run-status-${Date.now()}`,
          workflowId: workflow.id.toString(),
          taskId: task.id.toString(),
          task: 'Test task',
          status: 'running',
          context: '{}',
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/runs/${run.id}/status`, {
        status: 'completed',
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.data.status, 'completed')
    })

    it('should return 400 for invalid status', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          name: 'invalid-status-workflow',
          description: 'Test',
          config: { steps: [] },
        },
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Invalid',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      const run = await prisma.run.create({
        data: {
          id: `run-invalid-${Date.now()}`,
          workflowId: workflow.id.toString(),
          taskId: task.id.toString(),
          task: 'Test',
          status: 'running',
          context: '{}',
        },
      })

      const result = await makeRequest('PATCH', `/api/v1/runs/${run.id}/status`, {
        status: 'invalid_status',
      })

      assert.strictEqual(result.status, 400)
    })
  })

  describe('GET /api/v1/runs', () => {
    it('should return list of runs', async () => {
      const workflow = await prisma.workflow.create({
        data: {
          name: 'list-runs-workflow',
          description: 'Test',
          config: { steps: [] },
        },
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task List',
          boardId: testBoard.id,
          userId: testUser.id,
        },
      })

      await prisma.run.create({
        data: {
          id: `run-list-${Date.now()}`,
          workflowId: workflow.id.toString(),
          taskId: task.id.toString(),
          task: 'Test task',
          status: 'running',
          context: '{}',
        },
      })

      const result = await makeRequest('GET', '/api/v1/runs')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(Array.isArray(result.data.data))
      assert.ok(result.data.data.length >= 1)
    })
  })
})

export { setupTestEnvironment, cleanupTestEnvironment }
