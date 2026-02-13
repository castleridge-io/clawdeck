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
      emailAddress: `step-test-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'StepTestAgent',
      agentEmoji: '🧪'
    }
  })

  // Create test API token
  testToken = `cd_step_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await prisma.apiToken.create({
    data: {
      token: testToken,
      name: 'Step Test Token',
      userId: testUser.id
    }
  })

  // Create test board
  testBoard = await prisma.board.create({
    data: {
      name: 'Step Test Board',
      userId: testUser.id,
      position: 0
    }
  })

  // Create test workflow
  testWorkflow = await prisma.workflow.create({
    data: {
      name: 'step-test-workflow',
      description: 'Workflow for step testing',
      config: {
        steps: [
          { stepId: 'plan', agentId: 'planner', inputTemplate: 'Plan: {task}' },
          { stepId: 'implement', agentId: 'developer', inputTemplate: 'Implement: {task}' },
          { stepId: 'verify', agentId: 'verifier', inputTemplate: 'Verify: {task}' }
        ]
      }
    }
  })

  // Create test task
  testTask = await prisma.task.create({
    data: {
      name: 'Step Test Task',
      boardId: testBoard.id,
      userId: testUser.id
    }
  })

  // Create test run
  testRun = await prisma.run.create({
    data: {
      id: `run-step-test-${Date.now()}`,
      workflowId: testWorkflow.id.toString(),
      taskId: testTask.id.toString(),
      task: 'Test task for steps',
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
      'X-Agent-Name': 'StepTestAgent',
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

// Helper to create step with required expects field
function createStepData (overrides) {
  return {
    expects: 'output',
    ...overrides
  }
}

describe('Steps API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('GET /api/v1/runs/:runId/steps', () => {
    it('should return empty array when no steps exist', async () => {
      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/steps`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.deepStrictEqual(result.data.data, [])
    })

    it('should return list of steps for a run', async () => {
      // Create test steps
      await prisma.step.create({
        data: createStepData({
          id: `step-list-1-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'planner',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'waiting'
        })
      })

      await prisma.step.create({
        data: createStepData({
          id: `step-list-2-${Date.now()}`,
          runId: testRun.id,
          stepId: 'implement',
          agentId: 'developer',
          stepIndex: 1,
          inputTemplate: 'Implement: {task}',
          expects: 'code',
          status: 'waiting'
        })
      })

      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/steps`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(Array.isArray(result.data.data))
      assert.strictEqual(result.data.data.length, 2)
      assert.strictEqual(result.data.data[0].step_id, 'plan')
      assert.strictEqual(result.data.data[1].step_id, 'implement')
    })

    it('should return 404 for non-existent run', async () => {
      const result = await makeRequest('GET', '/api/v1/runs/non-existent-run/steps')

      assert.strictEqual(result.status, 404)
      assert.strictEqual(result.data.error, 'Run not found')
    })
  })

  describe('GET /api/v1/runs/:runId/steps/pending', () => {
    beforeEach(async () => {
      // Clean up steps before each test
      await prisma.step.deleteMany({ where: { runId: testRun.id } })
    })

    it('should return the next pending step', async () => {
      await prisma.step.create({
        data: createStepData({
          id: `step-pending-1-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'planner',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'completed'
        })
      })

      await prisma.step.create({
        data: createStepData({
          id: `step-pending-2-${Date.now()}`,
          runId: testRun.id,
          stepId: 'implement',
          agentId: 'developer',
          stepIndex: 1,
          inputTemplate: 'Implement: {task}',
          status: 'waiting'
        })
      })

      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/steps/pending`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.step_id, 'implement')
    })

    it('should return null when no pending steps', async () => {
      await prisma.step.create({
        data: createStepData({
          id: `step-no-pending-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'planner',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'completed'
        })
      })

      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/steps/pending`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data, null)
    })
  })

  describe('GET /api/v1/runs/:runId/steps/:stepId', () => {
    it('should return a single step', async () => {
      const step = await prisma.step.create({
        data: createStepData({
          id: `step-get-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'planner',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'waiting'
        })
      })

      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/steps/${step.id}`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.id, step.id)
      assert.strictEqual(result.data.data.step_id, 'plan')
    })

    it('should return 404 for non-existent step', async () => {
      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/steps/non-existent-step`)

      assert.strictEqual(result.status, 404)
      assert.strictEqual(result.data.error, 'Step not found')
    })
  })

  describe('POST /api/v1/runs/:runId/steps/:stepId/claim', () => {
    let testStep

    beforeEach(async () => {
      await prisma.step.deleteMany({ where: { runId: testRun.id } })
      testStep = await prisma.step.create({
        data: createStepData({
          id: `step-claim-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'StepTestAgent',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'waiting'
        })
      })
    })

    it('should claim a step successfully', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/claim`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.status, 'running')
      assert.ok(result.data.message.includes('claimed'))
    })

    it('should require agent_id', async () => {
      const result = await makeRequest(
        'POST',
        `/api/v1/runs/${testRun.id}/steps/${testStep.id}/claim`,
        {},
        { 'X-Agent-Name': '' }
      )

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('agent_id'))
    })

    it('should fail to claim already running step', async () => {
      // First claim
      await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/claim`)

      // Try to claim again
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/claim`)

      assert.strictEqual(result.status, 409) // Conflict
      assert.ok(result.data.error.includes('cannot be claimed'))
    })

    it('should fail to claim step assigned to different agent', async () => {
      const assignedStep = await prisma.step.create({
        data: createStepData({
          id: `step-assigned-${Date.now()}`,
          runId: testRun.id,
          stepId: 'implement',
          agentId: 'different-agent',
          stepIndex: 1,
          inputTemplate: 'Implement: {task}',
          status: 'waiting'
        })
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${assignedStep.id}/claim`)

      assert.strictEqual(result.status, 403)
      assert.ok(result.data.error.includes('assigned to agent'))
    })

    it('should fail to claim step when run is completed', async () => {
      // Update run to completed status
      await prisma.run.update({
        where: { id: testRun.id },
        data: { status: 'completed' }
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/claim`)

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Run status'))
      assert.strictEqual(result.data.run_status, 'completed')

      // Reset run status
      await prisma.run.update({
        where: { id: testRun.id },
        data: { status: 'running' }
      })
    })

    it('should fail to claim step when run is failed', async () => {
      // Update run to failed status
      await prisma.run.update({
        where: { id: testRun.id },
        data: { status: 'failed' }
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/claim`)

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Run status'))
      assert.strictEqual(result.data.run_status, 'failed')

      // Reset run status
      await prisma.run.update({
        where: { id: testRun.id },
        data: { status: 'running' }
      })
    })
  })

  describe('POST /api/v1/runs/:runId/steps/:stepId/complete', () => {
    let testStep

    beforeEach(async () => {
      await prisma.step.deleteMany({ where: { runId: testRun.id } })
      testStep = await prisma.step.create({
        data: createStepData({
          id: `step-complete-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'StepTestAgent',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'running'
        })
      })
    })

    it('should complete a step successfully', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/complete`, {
        output: { plan: 'Test plan output' }
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.status, 'completed')
      assert.deepStrictEqual(result.data.data.output, { plan: 'Test plan output' })
    })

    it('should fail to complete non-running step', async () => {
      await prisma.step.update({
        where: { id: testStep.id },
        data: { status: 'waiting' }
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/complete`, {
        output: { plan: 'Test' }
      })

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('cannot be completed'))
    })

    it('should mark run as completed when all steps done', async () => {
      // Complete the only step
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/complete`, {
        output: { plan: 'Done' }
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.run_completed, true)

      // Verify run status
      const runResult = await makeRequest('GET', `/api/v1/runs/${testRun.id}`)
      assert.strictEqual(runResult.data.data.status, 'completed')
    })
  })

  describe('POST /api/v1/runs/:runId/steps/:stepId/fail', () => {
    let testStep

    beforeEach(async () => {
      await prisma.step.deleteMany({ where: { runId: testRun.id } })
      testStep = await prisma.step.create({
        data: createStepData({
          id: `step-fail-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'StepTestAgent',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'running',
          maxRetries: 3
        })
      })
    })

    it('should fail a step and queue retry', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/fail`, {
        error: 'Something went wrong'
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.will_retry, true)
      assert.strictEqual(result.data.data.status, 'waiting')
      assert.ok(result.data.message.includes('retry'))
    })

    it('should require error message', async () => {
      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/fail`, {})

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('error message is required'))
    })

    it('should mark step as failed after max retries', async () => {
      // Set retry count to max
      await prisma.step.update({
        where: { id: testStep.id },
        data: { retryCount: 3 }
      })

      const result = await makeRequest('POST', `/api/v1/runs/${testRun.id}/steps/${testStep.id}/fail`, {
        error: 'Final failure'
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.will_retry, false)
      assert.strictEqual(result.data.data.status, 'failed')

      // Verify run is also failed
      const runResult = await makeRequest('GET', `/api/v1/runs/${testRun.id}`)
      assert.strictEqual(runResult.data.data.status, 'failed')
    })
  })

  describe('PATCH /api/v1/runs/:runId/steps/:stepId', () => {
    it('should update step status', async () => {
      const step = await prisma.step.create({
        data: createStepData({
          id: `step-patch-${Date.now()}`,
          runId: testRun.id,
          stepId: 'plan',
          agentId: 'StepTestAgent',
          stepIndex: 0,
          inputTemplate: 'Plan: {task}',
          status: 'waiting'
        })
      })

      const result = await makeRequest('PATCH', `/api/v1/runs/${testRun.id}/steps/${step.id}`, {
        status: 'awaiting_approval',
        output: { needsReview: true }
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.status, 'awaiting_approval')
    })
  })

  describe('Safe JSON parsing', () => {
    it('should handle invalid JSON in output gracefully', async () => {
      const step = await prisma.step.create({
        data: createStepData({
          id: `step-invalid-json-${Date.now()}`,
          runId: testRun.id,
          stepId: 'test',
          agentId: 'StepTestAgent',
          stepIndex: 0,
          inputTemplate: 'Test',
          status: 'completed',
          output: 'this is not valid json {{{'
        })
      })

      const result = await makeRequest('GET', `/api/v1/runs/${testRun.id}/steps/${step.id}`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      // Should return the string as-is since it's not valid JSON
      assert.strictEqual(result.data.data.output, 'this is not valid json {{{')
    })
  })
})
