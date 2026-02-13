import { APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:4333'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3335'

export interface TestUser {
  email: string
  password: string
  token?: string
}

export const DEFAULT_USER: TestUser = {
  email: process.env.TEST_USER_EMAIL || 'admin',
  password: process.env.TEST_USER_PASSWORD || 'admin',
}

/**
 * Login and get auth token
 */
export async function login(request: APIRequestContext, user: TestUser = DEFAULT_USER): Promise<string> {
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
 * Create a workflow via API
 */
export async function createWorkflow(
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
export async function deleteWorkflow(
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
export async function getWorkflows(
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
export async function createBoard(
  request: APIRequestContext,
  token: string,
  data: { name: string; icon?: string; color?: string }
): Promise<{ id: string; name: string }> {
  const response = await request.post(`${API_URL}/api/v1/boards`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
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
export async function deleteBoard(
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
export async function createTask(
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
  return result.data
}

/**
 * Delete a task via API
 */
export async function deleteTask(
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
