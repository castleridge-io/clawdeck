import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'
import { createWorkflowService } from '../../src/services/workflow.service.js'

// Test utilities
let testUser

async function setupTestEnvironment () {
  testUser = await prisma.user.create({
    data: {
      emailAddress: `workflow-unit-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖'
    }
  })
}

async function cleanupTestEnvironment () {
  await prisma.story.deleteMany({})
  await prisma.step.deleteMany({})
  await prisma.run.deleteMany({})
  await prisma.workflow.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.user.deleteMany({})
}

describe('Workflow Service', () => {
  let workflowService

  before(async () => {
    await setupTestEnvironment()
    workflowService = createWorkflowService()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('createWorkflow', () => {
    it('should create a workflow with valid data', async () => {
      const data = {
        name: 'test-workflow',
        description: 'Test workflow description',
        steps: [
          {
            stepId: 'step1',
            agentId: 'agent1',
            inputTemplate: 'Input template {var}',
            expects: 'output'
          }
        ]
      }

      const workflow = await workflowService.createWorkflow(data)

      assert.ok(workflow.id)
      assert.strictEqual(workflow.name, 'test-workflow')
      assert.strictEqual(workflow.description, 'Test workflow description')
      assert.ok(workflow.config)
      assert.strictEqual(workflow.config.steps.length, 1)
    })

    it('should throw error when name is missing', async () => {
      const data = {
        description: 'No name workflow'
      }

      await assert.rejects(
        () => workflowService.createWorkflow(data),
        (error) => {
          assert.ok(error.message.includes('name is required'))
          return true
        }
      )
    })

    it('should throw error when steps is not an array', async () => {
      const data = {
        name: 'invalid-workflow',
        steps: 'not-an-array'
      }

      await assert.rejects(
        () => workflowService.createWorkflow(data),
        (error) => {
          assert.ok(error.message.includes('steps must be an array'))
          return true
        }
      )
    })

    it('should validate step schema', async () => {
      const data = {
        name: 'invalid-step-workflow',
        steps: [
          {
            stepId: 'step1',
            // missing agentId
          }
        ]
      }

      await assert.rejects(
        () => workflowService.createWorkflow(data),
        (error) => {
          assert.ok(error.message.includes('agentId is required'))
          return true
        }
      )
    })

    it('should handle loop step type', async () => {
      const data = {
        name: 'loop-workflow',
        steps: [
          {
            stepId: 'loop-step',
            agentId: 'loop-agent',
            inputTemplate: 'Process {item}',
            expects: 'result',
            type: 'loop',
            loopConfig: {
              arrayField: 'items',
              maxIterations: 10
            }
          }
        ]
      }

      const workflow = await workflowService.createWorkflow(data)

      assert.strictEqual(workflow.config.steps[0].type, 'loop')
      assert.ok(workflow.config.steps[0].loopConfig)
    })

    it('should handle approval step type', async () => {
      const data = {
        name: 'approval-workflow',
        steps: [
          {
            stepId: 'approval-step',
            agentId: 'approval-agent',
            inputTemplate: 'Review {work}',
            expects: 'approval',
            type: 'approval'
          }
        ]
      }

      const workflow = await workflowService.createWorkflow(data)

      assert.strictEqual(workflow.config.steps[0].type, 'approval')
    })
  })

  describe('getWorkflow', () => {
    it('should return workflow by id', async () => {
      const created = await workflowService.createWorkflow({
        name: 'get-test',
        description: 'Test get workflow',
        steps: []
      })

      const workflow = await workflowService.getWorkflow(created.id)

      assert.ok(workflow)
      assert.strictEqual(workflow.id, created.id)
      assert.strictEqual(workflow.name, 'get-test')
    })

    it('should return null for non-existent workflow', async () => {
      const workflow = await workflowService.getWorkflow('non-existent-id')

      assert.strictEqual(workflow, null)
    })
  })

  describe('listWorkflows', () => {
    it('should return empty array when no workflows exist', async () => {
      await prisma.workflow.deleteMany({})

      const workflows = await workflowService.listWorkflows()

      assert.deepStrictEqual(workflows, [])
    })

    it('should return all workflows', async () => {
      await prisma.workflow.deleteMany({})

      await workflowService.createWorkflow({
        name: 'workflow-1',
        description: 'First workflow',
        steps: []
      })

      await workflowService.createWorkflow({
        name: 'workflow-2',
        description: 'Second workflow',
        steps: []
      })

      const workflows = await workflowService.listWorkflows()

      assert.strictEqual(workflows.length, 2)
      assert.ok(workflows.some(w => w.name === 'workflow-1'))
      assert.ok(workflows.some(w => w.name === 'workflow-2'))
    })

    it('should support filtering by name', async () => {
      await prisma.workflow.deleteMany({})

      await workflowService.createWorkflow({
        name: 'feature-dev',
        description: 'Feature workflow',
        steps: []
      })

      await workflowService.createWorkflow({
        name: 'bug-fix',
        description: 'Bug fix workflow',
        steps: []
      })

      const workflows = await workflowService.listWorkflows({ name: 'feature-dev' })

      assert.strictEqual(workflows.length, 1)
      assert.strictEqual(workflows[0].name, 'feature-dev')
    })
  })

  describe('deleteWorkflow', () => {
    it('should delete workflow by id', async () => {
      const created = await workflowService.createWorkflow({
        name: 'delete-test',
        description: 'Test delete',
        steps: []
      })

      await workflowService.deleteWorkflow(created.id)

      const workflow = await workflowService.getWorkflow(created.id)

      assert.strictEqual(workflow, null)
    })

    it('should throw error when deleting non-existent workflow', async () => {
      await assert.rejects(
        () => workflowService.deleteWorkflow('non-existent-id'),
        (error) => {
          assert.ok(error.message.includes('Workflow not found'))
          return true
        }
      )
    })

    it('should not delete workflow if it has active runs', async () => {
      const created = await workflowService.createWorkflow({
        name: 'active-workflow',
        description: 'Workflow with runs',
        steps: []
      })

      // Create a run for this workflow
      const task = await prisma.task.create({
        data: {
          name: 'Test Task',
          boardId: BigInt(1),
          userId: testUser.id
        }
      })

      await prisma.run.create({
        data: {
          id: `run-delete-test-${Date.now()}`,
          workflowId: created.id.toString(),
          taskId: task.id.toString(),
          task: 'Test task',
          status: 'running',
          context: '{}'
        }
      })

      await assert.rejects(
        () => workflowService.deleteWorkflow(created.id),
        (error) => {
          assert.ok(error.message.includes('Cannot delete workflow with active runs'))
          return true
        }
      )
    })
  })

  describe('getWorkflowByName', () => {
    it('should return workflow by name', async () => {
      await prisma.workflow.deleteMany({})

      const created = await workflowService.createWorkflow({
        name: 'byname-test',
        description: 'Test by name',
        steps: []
      })

      const workflow = await workflowService.getWorkflowByName('byname-test')

      assert.ok(workflow)
      assert.strictEqual(workflow.id, created.id)
    })

    it('should return null for non-existent name', async () => {
      const workflow = await workflowService.getWorkflowByName('non-existent-name')

      assert.strictEqual(workflow, null)
    })
  })
})
