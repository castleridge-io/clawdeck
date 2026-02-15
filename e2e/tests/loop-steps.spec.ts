import { test, expect } from '@playwright/test'
import { login, createWorkflow, createRun } from '../helpers/api'

const API_URL = process.env.API_URL || 'http://localhost:4333'

test.describe('Loop Steps (Phase 6)', () => {
  let token: string
  const createdWorkflowIds: string[] = []
  const createdRunIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await login(request)
  })

  test.afterAll(async ({ request }) => {
    // Cleanup
    for (const runId of createdRunIds) {
      await request.delete(`${API_URL}/api/v1/runs/${runId}`, {
        headers: { Authorization: `Bearer ${token}` },
        ignoreHTTPStatusCodes: true,
      })
    }
    for (const workflowId of createdWorkflowIds) {
      await request.delete(`${API_URL}/api/v1/workflows/${workflowId}`, {
        headers: { Authorization: `Bearer ${token}` },
        ignoreHTTPCodes: true,
      })
    }
  })

  test('should create workflow with loop step', async ({ request }) => {
    // #given: User has auth token
    // #when: Creating workflow with loop step
    const workflow = await createWorkflow(request, token, {
      name: `Loop Workflow ${Date.now()}`,
      description: 'Test loop step type',
      steps: [
        {
          stepId: 'planner',
          agentId: 'feature-dev/planner',
          inputTemplate: 'Create stories for: {{task}}',
          expects: 'STORIES_JSON',
          type: 'single',
        },
        {
          stepId: 'developer',
          agentId: 'feature-dev/developer',
          inputTemplate: 'Work on story: {{current_story}}',
          expects: 'done',
          type: 'loop',
          loopConfig: {
            over: 'stories',
            completion: 'all_done',
          },
        },
      ],
    })
    createdWorkflowIds.push(workflow.id)

    // #then: Workflow should be created with loop step
    const getResponse = await request.get(`${API_URL}/api/v1/workflows/${workflow.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(getResponse.ok()).toBeTruthy()
    const data = await getResponse.json()
    expect(data.success).toBe(true)
    expect(data.data.steps).toHaveLength(2)
    expect(data.data.steps[1].type).toBe('loop')
    expect(data.data.steps[1].loop_config).toEqual({
      over: 'stories',
      completion: 'all_done',
    })
  })

  test('should support creating stories for loop execution', async ({ request }) => {
    // #given: Workflow with loop step exists
    const workflow = await createWorkflow(request, token, {
      name: `Story Loop ${Date.now()}`,
      description: 'Test story creation for loop',
      steps: [
        {
          stepId: 'developer',
          agentId: 'feature-dev/developer',
          inputTemplate: 'Work on: {{current_story}}',
          expects: 'done',
          type: 'loop',
          loopConfig: {
            over: 'stories',
            completion: 'all_done',
          },
        },
      ],
    })
    createdWorkflowIds.push(workflow.id)

    // #when: Creating a run
    const runResponse = await request.post(`${API_URL}/api/v1/runs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        workflow_id: workflow.id,
        task: 'Implement feature X',
      },
    })

    expect(runResponse.ok()).toBeTruthy()
    const runData = await runResponse.json()
    const runId = runData.data.id
    createdRunIds.push(runId)

    // #when: Creating stories for the loop
    const story1 = await request.post(`${API_URL}/api/v1/runs/${runId}/stories`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        story_index: 0,
        story_id: 'story-1',
        title: 'Setup database',
        description: 'Create users table',
        acceptance_criteria: ['Table exists', 'Migration runs'],
      },
    })

    const story2 = await request.post(`${API_URL}/api/v1/runs/${runId}/stories`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        story_index: 1,
        story_id: 'story-2',
        title: 'Create API endpoint',
        description: 'POST /api/users',
        acceptance_criteria: ['Endpoint returns 201', 'Validation works'],
      },
    })

    expect(story1.ok()).toBeTruthy()
    expect(story2.ok()).toBeTruthy()

    // #then: Stories should be retrievable
    const stepsResponse = await request.get(`${API_URL}/api/v1/runs/${runId}/steps`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(stepsResponse.ok()).toBeTruthy()
    const stepsData = await stepsResponse.json()
    expect(stepsData.success).toBe(true)
    expect(stepsData.data).toHaveLength(1)
    expect(stepsData.data[0].type).toBe('loop')
  })

  test('should claim pending story when agent polls for work', async ({ request }) => {
    // #given: Run with loop step and pending stories exists
    const uniqueAgentId = `loop-tester-${Date.now()}`
    const workflow = await createWorkflow(request, token, {
      name: `Agent Poll Loop ${Date.now()}`,
      description: 'Test agent claiming loop stories',
      steps: [
        {
          stepId: 'worker',
          agentId: uniqueAgentId,
          inputTemplate: 'Your task: {{current_story}}',
          expects: 'done',
          type: 'loop',
          loopConfig: {
            over: 'stories',
            completion: 'all_done',
          },
        },
      ],
    })
    createdWorkflowIds.push(workflow.id)

    const run = await createRun(request, token, {
      workflowId: workflow.id,
      task: 'Test loop execution',
    })
    createdRunIds.push(run.id)

    // Create stories
    await request.post(`${API_URL}/api/v1/runs/${run.id}/stories`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        story_index: 0,
        story_id: 'story-1',
        title: 'First story',
        description: 'Do first thing',
        acceptance_criteria: ['Done'],
      },
    })

    // Start the run
    await request.patch(`${API_URL}/api/v1/runs/${run.id}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: 'running' },
    })

    // #when: Agent polls for work
    const claimResponse = await request.post(`${API_URL}/api/v1/steps/claim-by-agent`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { agent_id: uniqueAgentId },
    })

    // #then: Should get the first story
    expect(claimResponse.ok()).toBeTruthy()
    const claimData = await claimResponse.json()
    expect(claimData.success).toBe(true)
    expect(claimData.data).not.toBeNull()
    expect(claimData.data.resolved_input).toContain('First story')
    expect(claimData.data.story_id).toBeTruthy()
  })
})
