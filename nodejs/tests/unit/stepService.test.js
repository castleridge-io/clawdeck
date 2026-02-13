import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'
import { createWorkflowService } from '../../src/services/workflow.service.js'
import { createRunService } from '../../src/services/run.service.js'
import { createStepService } from '../../src/services/step.service.js'

// Helper to create step data with required fields
function createStepData(overrides) {
  return {
    expects: 'output',
    ...overrides
  }
}

// Test utilities
let testUser
let testBoard
let workflowService
let runService
let stepService

async function setupTestEnvironment () {
  testUser = await prisma.user.create({
    data: {
      emailAddress: `step-unit-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖'
    }
  })

  testBoard = await prisma.board.create({
    data: {
      name: 'Test Board',
      userId: testUser.id,
      position: 0
    }
  })

  workflowService = createWorkflowService()
  runService = createRunService()
  stepService = createStepService()
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

describe('Step Service', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('createStep', () => {
    it('should create a step with valid data', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'test-step-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const data = {
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input template {var}',
        expects: 'output'
      }

      const step = await stepService.createStep(data)

      assert.ok(step.id)
      assert.strictEqual(step.runId, run.id)
      assert.strictEqual(step.stepId, 'step-1')
      assert.strictEqual(step.agentId, 'agent-1')
      assert.strictEqual(step.status, 'waiting')
      assert.strictEqual(step.retryCount, 0)
    })

    it('should create step with loop type', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'loop-step-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Loop',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const data = {
        runId: run.id,
        stepId: 'loop-step',
        agentId: 'loop-agent',
        stepIndex: 0,
        inputTemplate: 'Process {item}',
        expects: 'result',
        type: 'loop',
        loopConfig: {
          arrayField: 'items',
          maxIterations: 10
        }
      }

      const step = await stepService.createStep(data)

      assert.strictEqual(step.type, 'loop')
      assert.ok(step.loopConfig)
    })

    it('should create step with approval type', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'approval-step-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Approval',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const data = {
        runId: run.id,
        stepId: 'approval-step',
        agentId: 'approval-agent',
        stepIndex: 0,
        inputTemplate: 'Review {work}',
        expects: 'approval',
        type: 'approval'
      }

      const step = await stepService.createStep(data)

      assert.strictEqual(step.type, 'approval')
    })

    it('should throw error when run does not exist', async () => {
      const data = {
        runId: 'non-existent-run-id',
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      }

      await assert.rejects(
        () => stepService.createStep(data),
        (error) => {
          assert.ok(error.message.includes('Run not found'))
          return true
        }
      )
    })
  })

  describe('getStep', () => {
    it('should return step by id', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'get-step-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Get Step',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const created = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      const step = await stepService.getStep(created.id)

      assert.ok(step)
      assert.strictEqual(step.id, created.id)
      assert.strictEqual(step.stepId, 'step-1')
    })

    it('should return null for non-existent step', async () => {
      const step = await stepService.getStep('non-existent-step-id')

      assert.strictEqual(step, null)
    })
  })

  describe('listStepsByRunId', () => {
    it('should return steps ordered by stepIndex', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'list-steps-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task List Steps',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      // Create steps in reverse order
      await stepService.createStep({
        runId: run.id,
        stepId: 'step-2',
        agentId: 'agent-2',
        stepIndex: 1,
        inputTemplate: 'Input 2',
        expects: 'output2'
      })

      await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input 1',
        expects: 'output1'
      })

      const steps = await stepService.listStepsByRunId(run.id)

      assert.strictEqual(steps.length, 2)
      assert.strictEqual(steps[0].stepId, 'step-1')
      assert.strictEqual(steps[1].stepId, 'step-2')
    })

    it('should return empty array for run with no steps', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'no-steps-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task No Steps',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const steps = await stepService.listStepsByRunId(run.id)

      assert.deepStrictEqual(steps, [])
    })
  })

  describe('updateStepStatus', () => {
    it('should update step status to running', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'update-step-running-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Update Running',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      const updated = await stepService.updateStepStatus(step.id, 'running')

      assert.strictEqual(updated.status, 'running')
    })

    it('should update step status to completed with output', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'update-step-completed-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Update Completed',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      const output = { result: 'success', data: 'test data' }
      const updated = await stepService.updateStepStatus(step.id, 'completed', output)

      assert.strictEqual(updated.status, 'completed')
      assert.strictEqual(updated.output, JSON.stringify(output))
    })

    it('should update step status to awaiting_approval', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'awaiting-approval-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Awaiting Approval',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'approval',
        type: 'approval'
      })

      const updated = await stepService.updateStepStatus(step.id, 'awaiting_approval')

      assert.strictEqual(updated.status, 'awaiting_approval')
    })

    it('should throw error for invalid status', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'invalid-step-status-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Invalid Step Status',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      await assert.rejects(
        () => stepService.updateStepStatus(step.id, 'invalid-status'),
        (error) => {
          assert.ok(error.message.includes('Invalid status'))
          return true
        }
      )
    })

    it('should throw error for non-existent step', async () => {
      await assert.rejects(
        () => stepService.updateStepStatus('non-existent-step-id', 'running'),
        (error) => {
          assert.ok(error.message.includes('Step not found'))
          return true
        }
      )
    })
  })

  describe('incrementStepRetry', () => {
    it('should increment retry count', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'increment-retry-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Increment Retry',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output',
        maxRetries: 3
      })

      const updated = await stepService.incrementStepRetry(step.id)

      assert.strictEqual(updated.retryCount, 1)
    })

    it('should throw error when max retries exceeded', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'max-retries-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Max Retries',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output',
        maxRetries: 2
      })

      // Increment to max
      await stepService.incrementStepRetry(step.id)
      await stepService.incrementStepRetry(step.id)

      // Should fail on third attempt
      await assert.rejects(
        () => stepService.incrementStepRetry(step.id),
        (error) => {
          assert.ok(error.message.includes('Maximum retries exceeded'))
          return true
        }
      )
    })
  })

  describe('getNextPendingStep', () => {
    it('should return next pending step', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'next-pending-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Next Pending',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input 1',
        expects: 'output1'
      })

      const step2 = await stepService.createStep({
        runId: run.id,
        stepId: 'step-2',
        agentId: 'agent-2',
        stepIndex: 1,
        inputTemplate: 'Input 2',
        expects: 'output2'
      })

      const nextStep = await stepService.getNextPendingStep(run.id)

      assert.ok(nextStep)
      assert.strictEqual(nextStep.stepId, 'step-1')
    })

    it('should return null when all steps are completed', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'all-completed-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task All Completed',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      await stepService.updateStepStatus(step.id, 'completed')

      const nextStep = await stepService.getNextPendingStep(run.id)

      assert.strictEqual(nextStep, null)
    })

    it('should return null when run has no steps', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'no-pending-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task No Pending',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const nextStep = await stepService.getNextPendingStep(run.id)

      assert.strictEqual(nextStep, null)
    })
  })

  describe('claimStep (atomic)', () => {
    it('should atomically claim a waiting step', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'claim-atomic-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Claim Atomic',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      const claimed = await stepService.claimStep(step.id, 'agent-1')

      assert.ok(claimed)
      assert.strictEqual(claimed.status, 'running')
    })

    it('should return null when step is already claimed', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'already-claimed-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Already Claimed',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      // First claim succeeds
      const firstClaim = await stepService.claimStep(step.id, 'agent-1')
      assert.ok(firstClaim)

      // Second claim fails
      const secondClaim = await stepService.claimStep(step.id, 'agent-2')
      assert.strictEqual(secondClaim, null)
    })

    it('should return null for non-existent step', async () => {
      const claimed = await stepService.claimStep('non-existent-step-id', 'agent-1')
      assert.strictEqual(claimed, null)
    })

    it('should handle concurrent claims atomically (race condition test)', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'concurrent-claim-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Concurrent Claim',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      // Simulate concurrent claims using Promise.all
      const results = await Promise.all([
        stepService.claimStep(step.id, 'agent-1'),
        stepService.claimStep(step.id, 'agent-2'),
        stepService.claimStep(step.id, 'agent-3')
      ])

      // Only one should succeed
      const successfulClaims = results.filter(r => r !== null)
      const failedClaims = results.filter(r => r === null)

      assert.strictEqual(successfulClaims.length, 1, 'Exactly one claim should succeed')
      assert.strictEqual(failedClaims.length, 2, 'Two claims should fail')
      assert.strictEqual(successfulClaims[0].status, 'running')

      // Verify the step is in running status
      const finalStep = await stepService.getStep(step.id)
      assert.strictEqual(finalStep.status, 'running')
    })

    it('should not claim a completed step', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'completed-step-claim-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Completed Step',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      // Complete the step
      await stepService.updateStepStatus(step.id, 'completed')

      // Try to claim
      const claimed = await stepService.claimStep(step.id, 'agent-1')
      assert.strictEqual(claimed, null)
    })

    it('should not claim a failed step', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'failed-step-claim-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task Failed Step',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      // Fail the step
      await stepService.updateStepStatus(step.id, 'failed')

      // Try to claim
      const claimed = await stepService.claimStep(step.id, 'agent-1')
      assert.strictEqual(claimed, null)
    })
  })

  describe('completeStepWithRunUpdate (transactional)', () => {
    it('should complete step and mark run as completed when all steps done', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'tx-complete-all-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task TX Complete All',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      // Claim first
      await stepService.claimStep(step.id, 'agent-1')

      // Complete with transaction
      const result = await stepService.completeStepWithRunUpdate(step.id, { result: 'done' })

      assert.strictEqual(result.step.status, 'completed')
      assert.strictEqual(result.runCompleted, true)

      // Verify run is also completed
      const finalRun = await runService.getRun(run.id)
      assert.strictEqual(finalRun.status, 'completed')
    })

    it('should complete step but not mark run as completed when other steps pending', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'tx-complete-partial-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task TX Complete Partial',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step1 = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input 1',
        expects: 'output1'
      })

      await stepService.createStep({
        runId: run.id,
        stepId: 'step-2',
        agentId: 'agent-2',
        stepIndex: 1,
        inputTemplate: 'Input 2',
        expects: 'output2'
      })

      // Claim and complete first step
      await stepService.claimStep(step1.id, 'agent-1')
      const result = await stepService.completeStepWithRunUpdate(step1.id, { result: 'done' })

      assert.strictEqual(result.step.status, 'completed')
      assert.strictEqual(result.runCompleted, false)

      // Verify run is still running
      const finalRun = await runService.getRun(run.id)
      assert.strictEqual(finalRun.status, 'running')
    })

    it('should handle output as string', async () => {
      const workflow = await workflowService.createWorkflow({
        name: 'tx-string-output-workflow',
        description: 'Test',
        steps: []
      })

      const task = await prisma.task.create({
        data: {
          name: 'Test Task TX String Output',
          boardId: testBoard.id,
          userId: testUser.id
        }
      })

      const run = await runService.createRun({
        workflowId: workflow.id.toString(),
        taskId: task.id.toString(),
        task: 'Test task'
      })

      const step = await stepService.createStep({
        runId: run.id,
        stepId: 'step-1',
        agentId: 'agent-1',
        stepIndex: 0,
        inputTemplate: 'Input',
        expects: 'output'
      })

      await stepService.claimStep(step.id, 'agent-1')
      const result = await stepService.completeStepWithRunUpdate(step.id, 'plain string output')

      assert.strictEqual(result.step.output, 'plain string output')
    })

    it('should throw error for non-existent step', async () => {
      await assert.rejects(
        () => stepService.completeStepWithRunUpdate('non-existent-step-id', {}),
        (error) => {
          assert.ok(error.code === 'P2025' || error.message.includes('not found'))
          return true
        }
      )
    })
  })
})
