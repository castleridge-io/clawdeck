import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'
import { createWorkflowService } from '../../src/services/workflow.service.js'
import { createRunService } from '../../src/services/run.service.js'

// Test utilities
let testUser
let testBoard
let workflowService
let runService

async function setupTestEnvironment () {
  testUser = await prisma.user.create({
    data: {
      emailAddress: `run-unit-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖'
    }
  })

  // Create test board
  testBoard = await prisma.board.create({
    data: {
      name: 'Test Board',
      userId: testUser.id,
      position: 0
    }
  })

  workflowService = createWorkflowService()
  runService = createRunService()
}

async function cleanupTestEnvironment () {
  await prisma.story.deleteMany({})
  await prisma.step.deleteMany({})
  await prisma.run.deleteMany({})
  await prisma.workflow.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.user.deleteMany({})
}

describe('Run Service', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('createRun', () => {
    it('should create a run with valid data', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'test-run-workflow',
        description: 'Test workflow',
        steps: [
          {
            stepId: 'step1',
            agentId: 'agent1',
            inputTemplate: 'Input {var}',
            expects: 'output'
          }
        ]
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const data = {
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task description',
        context: { key: 'value' }
      }

      const run = await runService.createRun(data)

      assert.ok(run.id)
      assert.strictEqual(run.workflowId, workflow.id.toString())
      assert.strictEqual(run.taskId, task.id.toString())
      assert.strictEqual(run.task, 'Test task description')
      assert.strictEqual(run.status, 'running')
      assert.strictEqual(run.context, '{"key":"value"}')
    })

    it('should throw error when workflow does not exist', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Test Task Invalid',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const data = {
        workflowId: 'non-existent-workflow-id',
        taskId: task.id.toString(),
        task: 'Test task'
      }

      await assert.rejects(
        () => runService.createRun(data),
        (error) => {
          assert.ok(error.message.includes('Workflow not found'))
          return true
        }
      )
    })

    it('should auto-generate run id if not provided', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'auto-id-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Auto ID',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const data = {
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      }

      const run = await runService.createRun(data)

      assert.ok(run.id)
      assert.ok(run.id.startsWith('run-'))
    })

    it('should create steps for workflow steps', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'multi-step-workflow',
        description: 'Test',
        steps: [
          {
            stepId: 'step1',
            agentId: 'agent1',
            inputTemplate: 'Input {var}',
            expects: 'output1'
          },
          {
            stepId: 'step2',
            agentId: 'agent2',
            inputTemplate: 'Input {var}',
            expects: 'output2'
          }
        ]
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Multi Step',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const data = {
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      }

      const run = await runService.createRun(data)

      const steps = await runService.listSteps(run.id)

      assert.strictEqual(steps.length, 2)
      assert.strictEqual(steps[0].stepId, 'step1')
      assert.strictEqual(steps[1].stepId, 'step2')
    })
  })

  describe('getRun', () => {
    it('should return run by id', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'get-run-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Get Run',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const created = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const run = await runService.getRun(created.id)

      assert.ok(run)
      assert.strictEqual(run.id, created.id)
      assert.strictEqual(run.status, 'running')
    })

    it('should return null for non-existent run', async () => {
      const run = await runService.getRun('non-existent-run-id')

      assert.strictEqual(run, null)
    })
  })

  describe('listRuns', () => {
    it('should return empty array when no runs exist', async () => {
      await prisma.run.deleteMany({})

      const runs = await runService.listRuns()

      assert.deepStrictEqual(runs, [])
    })

    it('should return all runs', async () => {
      await prisma.run.deleteMany({})

      const workflow = await workflowService.createWorkflow({
        name: 'list-runs-workflow',
        description: 'Test',
        steps: []
      })

      const task1 = await prisma.task.create({
        data: {
          name: 'Test Task List 1',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const task2 = await prisma.task.create({
        data: {
          name: 'Test Task List 2',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task1.id.toString(),
        task: 'Test task 1'
      })

      await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task2.id.toString(),
        task: 'Test task 2'
      })

      const runs = await runService.listRuns()

      assert.strictEqual(runs.length, 2)
    })

    it('should support filtering by taskId', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'filter-task-workflow',
        description: 'Test',
        steps: []
      })

      const task1 = await prisma.task.create({
        data: {
          name: 'Test Task Filter 1',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const task2 = await prisma.task.create({
        data: {
          name: 'Test Task Filter 2',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task1.id.toString(),
        task: 'Test task 1'
      })

      await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task2.id.toString(),
        task: 'Test task 2'
      })

      const runs = await runService.listRuns({ taskId: task1.id.toString() })

      assert.strictEqual(runs.length, 1)
      assert.strictEqual(runs[0].taskId, task1.id.toString())
    })

    it('should support filtering by status', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'filter-status-workflow',
        description: 'Test',
        steps: []
      })

      const task1 = await prisma.task.create({
        data: {
          name: 'Test Task Status 1',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const task2 = await prisma.task.create({
        data: {
          name: 'Test Task Status 2',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run1 = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task1.id.toString(),
        task: 'Test task 1'
      })

      const run2 = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task2.id.toString(),
        task: 'Test task 2'
      })

      // Update run1 to completed
      await runService.updateRunStatus(run1.id, 'completed')

      const runningRuns = await runService.listRuns({ status: 'running' })

      assert.strictEqual(runningRuns.length, 1)
      assert.strictEqual(runningRuns[0].id, run2.id)
    })
  })

  describe('updateRunStatus', () => {
    it('should update run status to completed', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'update-status-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Update Status',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const updated = await runService.updateRunStatus(run.id, 'completed')

      assert.strictEqual(updated.status, 'completed')
    })

    it('should update run status to failed', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'fail-status-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Fail Status',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const updated = await runService.updateRunStatus(run.id, 'failed')

      assert.strictEqual(updated.status, 'failed')
    })

    it('should throw error for invalid status', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'invalid-status-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Invalid Status',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      await assert.rejects(
        () => runService.updateRunStatus(run.id, 'invalid-status'),
        (error) => {
          assert.ok(error.message.includes('Invalid status'))
          return true
        }
      )
    })

    it('should throw error for non-existent run', async () => {
      await assert.rejects(
        () => runService.updateRunStatus('non-existent-run-id', 'completed'),
        (error) => {
          assert.ok(error.message.includes('Run not found'))
          return true
        }
      )
    })
  })

  describe('getRunsByTaskId', () => {
    it('should return runs for a specific task', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'by-task-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task By Task ID',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task 1'
      })

      await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task 2'
      })

      const runs = await runService.getRunsByTaskId(task.id.toString())

      assert.strictEqual(runs.length, 2)
    })

    it('should return empty array for task with no runs', async () => {
      const task = await prisma.task.create({
        data: {
          name: 'Test Task No Runs',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const runs = await runService.getRunsByTaskId(task.id.toString())

      assert.deepStrictEqual(runs, [])
    })
  })
})
