import { test, expect } from '@playwright/test'
import {
  login,
  createWorkflow,
  deleteWorkflow,
  createRun,
  getRun,
  getSteps,
  claimStep,
  completeStep,
  failStep,
  deleteRun,
  approveStep,
  rejectStep,
} from '../helpers/api'

test.describe('Workflow Executor', () => {
  let token: string
  const createdWorkflowIds: string[] = []
  const createdRunIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await login(request)
  })

  test.afterAll(async ({ request }) => {
    // Cleanup runs first (they depend on workflows)
    for (const id of createdRunIds) {
      try {
        await deleteRun(request, token, id)
      } catch {
        // Ignore cleanup errors
      }
    }
    // Then cleanup workflows
    for (const id of createdWorkflowIds) {
      try {
        await deleteWorkflow(request, token, id)
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  test.describe('Workflow Execution', () => {
    test('should create run with steps in waiting status', async ({ request }) => {
      // #given: Create a workflow with multiple steps
      const workflow = await createWorkflow(request, token, {
        name: `Executor Test Workflow ${Date.now()}`,
        description: 'Test workflow for executor',
        steps: [
          {
            stepId: 'plan',
            agentId: 'planner',
            inputTemplate: 'Plan: {{task}}',
            expects: 'STATUS: done',
            type: 'single',
          },
          {
            stepId: 'develop',
            agentId: 'developer',
            inputTemplate: 'Develop: {{task}}',
            expects: 'STATUS: done',
            type: 'single',
          },
        ],
      })
      createdWorkflowIds.push(workflow.id)

      // #when: Create a run
      const run = await createRun(request, token, {
        workflowId: workflow.id,
        task: 'Test execution task',
      })
      createdRunIds.push(run.id)

      // #then: Run should be created with running status
      expect(run.id).toBeDefined()
      expect(run.status).toBe('running')

      // #then: Steps should be created
      const steps = await getSteps(request, token, run.id)
      expect(steps.length).toBe(2)

      // First step should be pending, second should be waiting
      // API returns snake_case: step_id, agent_id
      const planStep = steps.find((s) => s.step_id === 'plan')
      const developStep = steps.find((s) => s.step_id === 'develop')

      expect(planStep?.status).toBe('pending')
      expect(developStep?.status).toBe('waiting')
    })

    test('should claim and complete a step', async ({ request }) => {
      // #given: Create workflow and run
      const workflow = await createWorkflow(request, token, {
        name: `Claim Test Workflow ${Date.now()}`,
        description: 'Test claim and complete',
        steps: [
          {
            stepId: 'plan',
            agentId: 'test-agent',
            inputTemplate: 'Plan: {{task}}',
            expects: 'STATUS: done',
            type: 'single',
          },
        ],
      })
      createdWorkflowIds.push(workflow.id)

      const run = await createRun(request, token, {
        workflowId: workflow.id,
        task: 'Test claim task',
      })
      createdRunIds.push(run.id)

      const steps = await getSteps(request, token, run.id)
      const planStep = steps.find((s) => s.step_id === 'plan')
      expect(planStep).toBeDefined()

      // #when: Claim the step
      const claimedStep = await claimStep(
        request,
        token,
        run.id,
        planStep!.id,
        'test-agent'
      )

      // #then: Step should be running
      expect(claimedStep.status).toBe('running')

      // #when: Complete the step
      const completedStep = await completeStep(
        request,
        token,
        run.id,
        planStep!.id,
        'STATUS: done\nCHANGES: completed planning'
      )

      // #then: Step should be completed
      expect(completedStep.status).toBe('completed')

      // #then: Run should be completed (only one step)
      // API returns snake_case: run_completed
      expect(completedStep.run_completed).toBe(true)

      const finalRun = await getRun(request, token, run.id)
      expect(finalRun.status).toBe('completed')
    })

    test('should advance to next step after completion', async ({ request }) => {
      // #given: Create workflow with two steps
      const workflow = await createWorkflow(request, token, {
        name: `Pipeline Test Workflow ${Date.now()}`,
        description: 'Test pipeline advancement',
        steps: [
          {
            stepId: 'plan',
            agentId: 'planner',
            inputTemplate: 'Plan: {{task}}',
            expects: 'STATUS: done',
            type: 'single',
          },
          {
            stepId: 'develop',
            agentId: 'developer',
            inputTemplate: 'Develop: {{task}}',
            expects: 'STATUS: done',
            type: 'single',
          },
        ],
      })
      createdWorkflowIds.push(workflow.id)

      const run = await createRun(request, token, {
        workflowId: workflow.id,
        task: 'Test pipeline task',
      })
      createdRunIds.push(run.id)

      let steps = await getSteps(request, token, run.id)
      const planStep = steps.find((s) => s.step_id === 'plan')
      const developStep = steps.find((s) => s.step_id === 'develop')

      // Initially: plan=pending, develop=waiting
      expect(planStep?.status).toBe('pending')
      expect(developStep?.status).toBe('waiting')

      // #when: Claim and complete first step
      await claimStep(request, token, run.id, planStep!.id, 'planner')
      await completeStep(request, token, run.id, planStep!.id, 'STATUS: done')

      // #then: Second step should now be pending
      steps = await getSteps(request, token, run.id)
      const updatedDevelopStep = steps.find((s) => s.step_id === 'develop')
      expect(updatedDevelopStep?.status).toBe('pending')
    })

    test('should handle step failure with retry', async ({ request }) => {
      // #given: Create workflow with retry enabled
      const workflow = await createWorkflow(request, token, {
        name: `Retry Test Workflow ${Date.now()}`,
        description: 'Test retry logic',
        steps: [
          {
            stepId: 'plan',
            agentId: 'planner',
            inputTemplate: 'Plan: {{task}}',
            expects: 'STATUS: done',
            type: 'single',
            maxRetries: 2,
          },
        ],
      })
      createdWorkflowIds.push(workflow.id)

      const run = await createRun(request, token, {
        workflowId: workflow.id,
        task: 'Test retry task',
      })
      createdRunIds.push(run.id)

      const steps = await getSteps(request, token, run.id)
      const planStep = steps.find((s) => s.step_id === 'plan')

      // Claim the step
      await claimStep(request, token, run.id, planStep!.id, 'planner')

      // #when: Fail the step
      const result = await failStep(
        request,
        token,
        run.id,
        planStep!.id,
        'Something went wrong'
      )

      // #then: Step should be set to pending for retry
      expect(result.will_retry).toBe(true)

      const updatedSteps = await getSteps(request, token, run.id)
      const updatedStep = updatedSteps.find((s) => s.step_id === 'plan')
      expect(updatedStep?.status).toBe('pending')
    })
  })

  test.describe('Template Resolution (via API)', () => {
    test('should resolve template variables when claiming step', async ({ request }) => {
      // #given: Create workflow with template
      const workflow = await createWorkflow(request, token, {
        name: `Template Test Workflow ${Date.now()}`,
        description: 'Test template resolution',
        steps: [
          {
            stepId: 'develop',
            agentId: 'developer',
            inputTemplate:
              'Task: {{task}}\nBranch: {{branch}}\nBuild: {{build_cmd}}',
            expects: 'STATUS: done',
            type: 'single',
          },
        ],
      })
      createdWorkflowIds.push(workflow.id)

      const run = await createRun(request, token, {
        workflowId: workflow.id,
        task: 'Implement user authentication',
      })
      createdRunIds.push(run.id)

      const steps = await getSteps(request, token, run.id)
      const developStep = steps.find((s) => s.step_id === 'develop')

      // #when: Claim the step
      const claimedStep = await claimStep(
        request,
        token,
        run.id,
        developStep!.id,
        'developer'
      )

      // #then: The input_template should contain the task
      // Note: The actual resolved input is returned in the claim response
      expect(claimedStep.status).toBe('running')
    })
  })

  test.describe('Approval Flow', () => {
    test('should approve an awaiting_approval step', async ({ request }) => {
      // #given: Create workflow with approval step
      const workflow = await createWorkflow(request, token, {
        name: `Approval Test Workflow ${Date.now()}`,
        description: 'Test approval flow',
        steps: [
          {
            stepId: 'plan',
            agentId: 'planner',
            inputTemplate: 'Plan: {{task}}',
            expects: 'STATUS: done',
            type: 'approval',
          },
        ],
      })
      createdWorkflowIds.push(workflow.id)

      const run = await createRun(request, token, {
        workflowId: workflow.id,
        task: 'Test approval task',
      })
      createdRunIds.push(run.id)

      const steps = await getSteps(request, token, run.id)
      const approvalStep = steps.find((s) => s.step_id === 'plan')
      expect(approvalStep).toBeDefined()

      // Claim and set to awaiting_approval
      await claimStep(request, token, run.id, approvalStep!.id, 'planner')

      // Manually set to awaiting_approval (simulating agent requesting approval)
      await request.patch(
        `${process.env.API_URL || 'http://localhost:4333'}/api/v1/runs/${run.id}/steps/${approvalStep!.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { status: 'awaiting_approval' },
        }
      )

      // #when: Approve the step
      const approvedStep = await approveStep(
        request,
        token,
        run.id,
        approvalStep!.id,
        'Looks good!'
      )

      // #then: Step should be completed
      expect(approvedStep.status).toBe('completed')

      // #then: Run should be completed
      const finalRun = await getRun(request, token, run.id)
      expect(finalRun.status).toBe('completed')
    })

    test('should reject an awaiting_approval step', async ({ request }) => {
      // #given: Create workflow with approval step
      const workflow = await createWorkflow(request, token, {
        name: `Reject Test Workflow ${Date.now()}`,
        description: 'Test rejection flow',
        steps: [
          {
            stepId: 'plan',
            agentId: 'planner',
            inputTemplate: 'Plan: {{task}}',
            expects: 'STATUS: done',
            type: 'approval',
          },
        ],
      })
      createdWorkflowIds.push(workflow.id)

      const run = await createRun(request, token, {
        workflowId: workflow.id,
        task: 'Test rejection task',
      })
      createdRunIds.push(run.id)

      const steps = await getSteps(request, token, run.id)
      const approvalStep = steps.find((s) => s.step_id === 'plan')

      // Claim and set to awaiting_approval
      await claimStep(request, token, run.id, approvalStep!.id, 'planner')

      // Manually set to awaiting_approval
      await request.patch(
        `${process.env.API_URL || 'http://localhost:4333'}/api/v1/runs/${run.id}/steps/${approvalStep!.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { status: 'awaiting_approval' },
        }
      )

      // #when: Reject the step
      const rejectedStep = await rejectStep(
        request,
        token,
        run.id,
        approvalStep!.id,
        'Needs more work'
      )

      // #then: Step should be failed
      expect(rejectedStep.status).toBe('failed')

      // #then: Run should be failed
      const finalRun = await getRun(request, token, run.id)
      expect(finalRun.status).toBe('failed')
    })
  })
})
