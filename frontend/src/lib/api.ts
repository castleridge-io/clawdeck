import { getToken, clearToken } from './auth'
import type { Board, Task, Agent, Workflow, Run, ArchivedTask, ApiToken, User } from '../types'

const API_BASE = '/api/v1'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

interface ApiResponse<T> {
  data?: T
  meta?: {
    total: number
    page: number
    pages: number
  }
  error?: string
}

async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const token = getToken()

  // Only set Content-Type for methods that typically have a body
  const hasBody = options.body !== undefined
  const headers: Record<string, string> = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers as Record<string, string>,
  }
  if (hasBody) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    clearToken()
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    throw new AuthError('Session expired. Please log in again.')
  }

  if (!response.ok) {
    const errorData = await response.json().catch((): { error?: string } => ({}))
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
  }

  if (response.status === 204) {
    return null as T
  }

  return response.json()
}

// Boards
export async function getBoards(): Promise<Board[]> {
  const response = await fetchWithAuth<ApiResponse<Board[]>>('/boards')
  return response.data || response as unknown as Board[]
}

export async function getBoard(boardId: string): Promise<Board> {
  const response = await fetchWithAuth<ApiResponse<Board>>(`/boards/${boardId}`)
  return response.data || response as unknown as Board
}

// Tasks
export async function getTasks(boardId: string): Promise<Task[]> {
  const response = await fetchWithAuth<ApiResponse<Task[]>>(`/tasks?board_id=${boardId}`)
  return response.data || response as unknown as Task[]
}

export async function createTask(taskData: Partial<Task>): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>('/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  })
  return response.data || response as unknown as Task
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return response.data || response as unknown as Task
}

export async function deleteTask(taskId: string): Promise<boolean> {
  await fetchWithAuth(`/tasks/${taskId}`, { method: 'DELETE' })
  return true
}

export async function assignTask(taskId: string): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>(`/tasks/${taskId}/assign`, {
    method: 'PATCH',
  })
  return response.data || response as unknown as Task
}

export async function claimTask(taskId: string): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>(`/tasks/${taskId}/claim`, {
    method: 'PATCH',
  })
  return response.data || response as unknown as Task
}

export async function unclaimTask(taskId: string): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>(`/tasks/${taskId}/unclaim`, {
    method: 'PATCH',
  })
  return response.data || response as unknown as Task
}

export async function completeTask(taskId: string): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  })
  return response.data || response as unknown as Task
}

export async function getNextTask(): Promise<Task | null> {
  const response = await fetchWithAuth<Task | null>('/tasks/next')
  return response
}

// Agents
export async function getAgents(): Promise<Agent[]> {
  const response = await fetchWithAuth<ApiResponse<Agent[]>>('/agents')
  return response.data || response as unknown as Agent[]
}

// Archive
interface ArchiveFilters {
  board_id?: string
  page?: number
  limit?: number
}

export async function getArchivedTasks(filters: ArchiveFilters = {}): Promise<ApiResponse<ArchivedTask[]>> {
  const params = new URLSearchParams()
  if (filters.board_id) params.append('board_id', filters.board_id)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.limit) params.append('limit', String(filters.limit))

  const queryString = params.toString()
  return fetchWithAuth<ApiResponse<ArchivedTask[]>>(`/archives${queryString ? `?${queryString}` : ''}`)
}

export async function unarchiveTask(taskId: string): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>(`/archives/${taskId}/unarchive`, {
    method: 'PATCH',
  })
  return response.data || response as unknown as Task
}

export async function scheduleArchive(taskId: string): Promise<Task> {
  const response = await fetchWithAuth<ApiResponse<Task>>(`/archives/${taskId}/schedule`, {
    method: 'PATCH',
  })
  return response.data || response as unknown as Task
}

export async function deleteArchivedTask(taskId: string): Promise<boolean> {
  await fetchWithAuth(`/archives/${taskId}`, { method: 'DELETE' })
  return true
}

// Workflows
export async function getWorkflows(): Promise<Workflow[]> {
  const response = await fetchWithAuth<ApiResponse<Workflow[]>>('/workflows')
  return response.data || response as unknown as Workflow[]
}

export async function getWorkflow(workflowId: string): Promise<Workflow> {
  const response = await fetchWithAuth<ApiResponse<Workflow>>(`/workflows/${workflowId}`)
  return response.data || response as unknown as Workflow
}

export async function createWorkflow(workflowData: Partial<Workflow>): Promise<Workflow> {
  const response = await fetchWithAuth<ApiResponse<Workflow>>('/workflows', {
    method: 'POST',
    body: JSON.stringify(workflowData),
  })
  return response.data || response as unknown as Workflow
}

export async function updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<Workflow> {
  const response = await fetchWithAuth<ApiResponse<Workflow>>(`/workflows/${workflowId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return response.data || response as unknown as Workflow
}

export async function deleteWorkflow(workflowId: string): Promise<boolean> {
  await fetchWithAuth(`/workflows/${workflowId}`, { method: 'DELETE' })
  return true
}

export async function importWorkflowYaml(yamlString: string): Promise<Workflow> {
  const response = await fetchWithAuth<ApiResponse<Workflow>>('/workflows/import-yaml', {
    method: 'POST',
    body: JSON.stringify({ yaml: yamlString }),
  })
  return response.data || response as unknown as Workflow
}

// Runs
interface RunFilters {
  status?: string
  workflow_id?: string
  page?: number
  limit?: number
}

export async function getRuns(filters: RunFilters = {}): Promise<Run[]> {
  const params = new URLSearchParams()
  if (filters.status) params.append('status', filters.status)
  if (filters.workflow_id) params.append('workflow_id', filters.workflow_id)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.limit) params.append('limit', String(filters.limit))

  const queryString = params.toString()
  const response = await fetchWithAuth<ApiResponse<Run[]>>(`/runs${queryString ? `?${queryString}` : ''}`)
  return response.data || response as unknown as Run[]
}

export async function getRun(runId: string): Promise<Run> {
  const response = await fetchWithAuth<ApiResponse<Run>>(`/runs/${runId}`)
  return response.data || response as unknown as Run
}

export async function triggerRun(workflowId: string): Promise<Run> {
  const response = await fetchWithAuth<ApiResponse<Run>>('/runs', {
    method: 'POST',
    body: JSON.stringify({ workflow_id: workflowId }),
  })
  return response.data || response as unknown as Run
}

export async function cancelRun(runId: string): Promise<Run> {
  const response = await fetchWithAuth<ApiResponse<Run>>(`/runs/${runId}/cancel`, {
    method: 'POST',
  })
  return response.data || response as unknown as Run
}

// Settings
export async function getSettings(): Promise<User> {
  return fetchWithAuth<User>('/auth/me')
}

export async function updateSettings(data: Partial<User>): Promise<User> {
  return fetchWithAuth<User>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function updatePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return fetchWithAuth('/auth/me/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

export async function getApiToken(): Promise<ApiToken> {
  return fetchWithAuth<ApiToken>('/auth/me/api-token')
}

export async function regenerateApiToken(): Promise<ApiToken> {
  return fetchWithAuth<ApiToken>('/auth/me/api-token/regenerate', {
    method: 'POST',
  })
}

// OpenClaw Settings
export interface OpenClawSettings {
  url: string
  apiKey: string
  hasApiKey: boolean
  connected: boolean
  lastChecked: string | null
}

export async function getOpenClawSettings(): Promise<OpenClawSettings> {
  const response = await fetchWithAuth<ApiResponse<OpenClawSettings>>('/settings/openclaw')
  return response.data || response as unknown as OpenClawSettings
}

export async function updateOpenClawSettings(data: { url?: string; apiKey?: string }): Promise<OpenClawSettings> {
  const response = await fetchWithAuth<ApiResponse<OpenClawSettings>>('/settings/openclaw', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return response.data || response as unknown as OpenClawSettings
}

export async function testOpenClawConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetchWithAuth<ApiResponse<{ success: boolean; message?: string; error?: string }>>('/settings/openclaw/test', {
    method: 'POST',
  })
  return response.data || response as unknown as { success: boolean; message?: string; error?: string }
}

export async function clearOpenClawApiKey(): Promise<void> {
  await fetchWithAuth('/settings/openclaw/api-key', { method: 'DELETE' })
}

// Admin
export async function getUsers(): Promise<User[]> {
  const response = await fetchWithAuth<ApiResponse<User[]>>('/admin/users')
  return response.data || response as unknown as User[]
}

export async function updateUser(userId: string, data: Partial<User>): Promise<User> {
  const response = await fetchWithAuth<ApiResponse<User>>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return response.data || response as unknown as User
}
