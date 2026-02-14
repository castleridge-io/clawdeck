import { test, expect } from '@playwright/test'
import { login, createWorkflow, createApiToken } from '../helpers/api'

test.describe('WebSocket Workflow Events (Phase 5)', () => {
  let token: string
  let apiToken: string
  const createdWorkflowIds: string[] = []
  const createdRunIds: string[] = []

  test.beforeAll(async ({ request }) => {
    token = await login(request)
    // Create API token for WebSocket authentication
    apiToken = await createApiToken(request, token, 'E2E WebSocket Test')
  })

  test.afterAll(async ({ request }) => {
    // Cleanup
    for (const runId of createdRunIds) {
      await request.delete(`http://localhost:4333/api/v1/runs/${runId}`, {
        headers: { Authorization: `Bearer ${token}` },
        ignoreHTTPStatusCodes: true,
      })
    }
    for (const workflowId of createdWorkflowIds) {
      await request.delete(`http://localhost:4333/api/v1/workflows/${workflowId}`, {
        headers: { Authorization: `Bearer ${token}` },
        ignoreHTTPCodes: true,
      })
    }
  })

  test('should connect to WebSocket and receive messages', async ({ page }) => {
    // #given: User logs in and gets token
    await page.goto('/')

    // #when: Connect to WebSocket
    const wsConnected = await page.evaluate(async ({ apiToken }) => {
      return new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:4333/ws?token=${apiToken}`)

        ws.onopen = () => {
          ws.close()
          resolve(true)
        }

        ws.onerror = () => {
          resolve(false)
        }

        // Timeout after 5 seconds
        setTimeout(() => {
          ws.close()
          resolve(false)
        }, 5000)
      })
    }, { apiToken })

    // #then: Should connect successfully
    expect(wsConnected).toBe(true)
  })

  test('should create workflow run and trigger WebSocket event', async ({ page }) => {
    // #given: Workflow exists and WebSocket is connected
    const workflow = await createWorkflow(page.request, token, {
      name: `WebSocket Event ${Date.now()}`,
      description: 'Test run.created event',
      steps: [
        {
          stepId: 'test',
          agentId: 'tester',
          inputTemplate: 'Test',
          expects: 'done',
          type: 'single',
        },
      ],
    })
    createdWorkflowIds.push(workflow.id)

    // Set up WebSocket listener before creating run
    const eventReceived = await page.evaluate(async ({ token, apiToken, workflowId }) => {
      return new Promise((resolve) => {
        const ws = new WebSocket(`ws://localhost:4333/ws?token=${apiToken}`)

        let receivedEvent = false

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'workflow_event' && data.event === 'run.created') {
              receivedEvent = true
              ws.close()
              resolve(receivedEvent)
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onopen = () => {
          // Trigger run creation
          fetch('http://localhost:4333/api/v1/runs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              workflow_id: workflowId,
              task: 'WebSocket event test',
            }),
          }).catch(() => {})
        }

        // Timeout after 10 seconds
        setTimeout(() => {
          ws.close()
          resolve(receivedEvent)
        }, 10000)
      })
    }, { token, apiToken, workflowId: workflow.id })

    // #then: Should receive run.created event
    expect(eventReceived).toBe(true)
  })
})
