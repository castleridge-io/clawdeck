import { APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:4333'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

export interface TestUser {
  email: string
  password: string
  token?: string
}

export const DEFAULT_USER: TestUser = {
  email: process.env.TEST_USER_EMAIL || 'admin',
  password: process.env.TEST_USER_PASSWORD || 'admin',
}

export interface TestOrganization {
  id: string
  name: string
  slug: string
}

let cachedOrganization: TestOrganization | null = null

/**
 * Get or create default organization for tests
 */
export async function getOrCreateOrganization (request: APIRequestContext, token: string): Promise<TestOrganization> {
  if (cachedOrganization) {
    return cachedOrganization
  }

  // Try to get the first organization (Default Organization exists in seed data)
  const listResponse = await request.get(`${API_URL}/api/v1/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (listResponse.ok()) {
    const listData = await listResponse.json()
    if (listData.data?.[0]) {
      cachedOrganization = {
        id: listData.data[0].id,
        name: listData.data[0].name,
        slug: listData.data[0].slug,
      }
      return cachedOrganization
    }
  }

  // Create organization
  const createResponse = await request.post(`${API_URL}/api/v1/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: 'E2E Test Organization',
      slug: `e2e-test-${Date.now()}`,
    },
  })

  if (!createResponse.ok()) {
    throw new Error(`Failed to create organization: ${createResponse.status()} ${await createResponse.text()}`)
  }

  const result = await createResponse.json()
  cachedOrganization = result.data
  return cachedOrganization
}

/**
 * Login and get auth token
 */
export async function login (
  request: APIRequestContext,
  user: TestUser = DEFAULT_USER
): Promise<string> {
  const response = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: {
      emailAddress: user.email,
      password: user.password,
    },
  })

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`)
  }

  const data = await response.json()
  return data.token
}

/**
 * Create an API token for WebSocket authentication
 */
export async function createApiToken (
  request: APIRequestContext,
  token: string,
  name?: string
): Promise<string> {
  const response = await request.post(`${API_URL}/api/v1/settings/regenerate_token`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: name || 'E2E Test API Token' },
  })

  if (!response.ok()) {
    throw new Error(`Create API token failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data.token
}

/**
 * Create a workflow via API
 */
export async function createWorkflow (
  request: APIRequestContext,
  token: string,
  data: { name: string; description?: string; steps?: unknown[] }
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API_URL}/api/v1/workflows`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  })

  if (!response.ok()) {
    throw new Error(`Create workflow failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Delete a workflow via API
 */
export async function deleteWorkflow (
  request: APIRequestContext,
  token: string,
  workflowId: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/api/v1/workflows/${workflowId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok() && response.status() !== 204) {
    throw new Error(`Delete workflow failed: ${response.status()} ${await response.text()}`)
  }
}

/**
 * Get all workflows via API
 */
export async function getWorkflows (
  request: APIRequestContext,
  token: string
): Promise<Array<{ id: string; name: string }>> {
  const response = await request.get(`${API_URL}/api/v1/workflows`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    throw new Error(`Get workflows failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Create a board via API
 */
export async function createBoard (
  request: APIRequestContext,
  token: string,
  _userId: string,
  _organizationId: string,
  data: { name: string; icon?: string; color?: string }
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API_URL}/api/v1/boards`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: data.name,
      icon: data.icon,
      color: data.color,
    },
  })

  if (!response.ok()) {
    throw new Error(`Create board failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Delete a board via API
 */
export async function deleteBoard (
  request: APIRequestContext,
  token: string,
  boardId: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/api/v1/boards/${boardId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok() && response.status() !== 204) {
    throw new Error(`Delete board failed: ${response.status()} ${await response.text()}`)
  }
}

/**
 * Create a task via API
 */
export async function createTask (
  request: APIRequestContext,
  token: string,
  boardId: string,
  data: { name: string; description?: string; status?: string }
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API_URL}/api/v1/tasks`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      board_id: boardId,
      ...data,
    },
  })

  if (!response.ok()) {
    throw new Error(`Create task failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result
}

/**
 * Delete a task via API
 */
export async function deleteTask (
  request: APIRequestContext,
  token: string,
  taskId: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok() && response.status() !== 204) {
    throw new Error(`Delete task failed: ${response.status()} ${await response.text()}`)
  }
}

// ========================================
// Workflow Execution Helpers
// ========================================

/**
 * Create a run (trigger workflow execution)
 */
export async function createRun (
  request: APIRequestContext,
  token: string,
  data: { workflowId: string; task: string; taskId?: string }
): Promise<{ id: string; workflowId: string; task: string; status: string }> {
  const response = await request.post(`${API_URL}/api/v1/runs`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      workflow_id: data.workflowId,
      task: data.task,
      task_id: data.taskId,
    },
  })

  if (!response.ok()) {
    throw new Error(`Create run failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Get run by ID
 */
export async function getRun (
  request: APIRequestContext,
  token: string,
  runId: string
): Promise<{ id: string; status: string; context?: string }> {
  const response = await request.get(`${API_URL}/api/v1/runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    throw new Error(`Get run failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Get steps for a run
 */
export async function getSteps (
  request: APIRequestContext,
  token: string,
  runId: string
): Promise<Array<{ id: string; stepId: string; status: string; agentId: string }>> {
  const response = await request.get(`${API_URL}/api/v1/runs/${runId}/steps`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    throw new Error(`Get steps failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Claim a step by ID
 */
export async function claimStep (
  request: APIRequestContext,
  token: string,
  runId: string,
  stepId: string,
  agentId: string
): Promise<{ id: string; status: string }> {
  const response = await request.post(
    `${API_URL}/api/v1/runs/${runId}/steps/${stepId}/claim`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { agent_id: agentId },
    }
  )

  if (!response.ok()) {
    throw new Error(`Claim step failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Complete a step
 */
export async function completeStep (
  request: APIRequestContext,
  token: string,
  runId: string,
  stepId: string,
  output: string
): Promise<{ id: string; status: string; run_completed?: boolean }> {
  const response = await request.post(
    `${API_URL}/api/v1/runs/${runId}/steps/${stepId}/complete`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { output },
    }
  )

  if (!response.ok()) {
    throw new Error(`Complete step failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  // run_completed is at the top level, not in data
  return {
    ...result.data,
    run_completed: result.run_completed,
  }
}

/**
 * Fail a step
 */
export async function failStep (
  request: APIRequestContext,
  token: string,
  runId: string,
  stepId: string,
  error: string
): Promise<{ id: string; status: string; will_retry?: boolean }> {
  const response = await request.post(
    `${API_URL}/api/v1/runs/${runId}/steps/${stepId}/fail`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { error },
    }
  )

  if (!response.ok()) {
    throw new Error(`Fail step failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  // will_retry is at the top level
  return {
    ...result.data,
    will_retry: result.will_retry,
  }
}

/**
 * Delete a run
 */
export async function deleteRun (
  request: APIRequestContext,
  token: string,
  runId: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/api/v1/runs/${runId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok() && response.status() !== 204) {
    throw new Error(`Delete run failed: ${response.status()} ${await response.text()}`)
  }
}

/**
 * Approve a step
 */
export async function approveStep (
  request: APIRequestContext,
  token: string,
  runId: string,
  stepId: string,
  approvalNote?: string
): Promise<{ id: string; status: string }> {
  const response = await request.post(
    `${API_URL}/api/v1/runs/${runId}/steps/${stepId}/approve`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { approval_note: approvalNote },
    }
  )

  if (!response.ok()) {
    throw new Error(`Approve step failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Reject a step
 */
export async function rejectStep (
  request: APIRequestContext,
  token: string,
  runId: string,
  stepId: string,
  rejectionReason?: string
): Promise<{ id: string; status: string }> {
  const response = await request.post(
    `${API_URL}/api/v1/runs/${runId}/steps/${stepId}/reject`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { rejection_reason: rejectionReason },
    }
  )

  if (!response.ok()) {
    throw new Error(`Reject step failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Claim step by agent (agent polls for work)
 */
export async function claimStepByAgent (
  request: APIRequestContext,
  token: string,
  agentId: string
): Promise<{ found: boolean; step_id?: string; run_id?: string; resolved_input?: string; story_id?: string }> {
  const response = await request.post(
    `${API_URL}/api/v1/steps/claim-by-agent`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { agent_id: agentId },
    }
  )

  if (!response.ok()) {
    throw new Error(`Claim step by agent failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  // If data is null (no work found), return { found: false }
  return result.data ?? { found: false }
}

/**
 * Complete step with pipeline (merges context and advances)
 */
export async function completeStepWithPipeline (
  request: APIRequestContext,
  token: string,
  stepId: string,
  output: string
): Promise<{ step_completed: boolean; run_completed: boolean }> {
  const response = await request.post(
    `${API_URL}/api/v1/steps/${stepId}/complete-with-pipeline`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { output },
    }
  )

  if (!response.ok()) {
    throw new Error(`Complete step with pipeline failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}

/**
 * Cleanup abandoned steps
 */
export async function cleanupAbandonedSteps (
  request: APIRequestContext,
  token: string,
  maxAgeMinutes?: number
): Promise<{ cleaned_count: number }> {
  const url = maxAgeMinutes
    ? `${API_URL}/api/v1/steps/cleanup-abandoned?max_age_minutes=${maxAgeMinutes}`
    : `${API_URL}/api/v1/steps/cleanup-abandoned`

  const response = await request.post(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    throw new Error(`Cleanup abandoned steps failed: ${response.status()} ${await response.text()}`)
  }

  const result = await response.json()
  return result.data
}
