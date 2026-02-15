import { getToken, clearToken } from './auth'
import { z } from 'zod'
import {
  BoardSchema,
  TaskSchema,
  AgentSchema,
  WorkflowSchema,
  RunSchema,
  UserSchema,
  ArchivedTaskSchema,
  ApiTokenSchema,
  OpenClawSettingsSchema,
  AdminBoardSchema,
  AdminTaskSchema,
  OrganizationSchema,
  ApiResponse,
  AdminListResponse,
} from './schemas'
import type {
  Board,
  Task,
  Agent,
  Workflow,
  Run,
  User,
  ArchivedTask,
  ApiToken,
  OpenClawSettings,
  AdminBoard,
  AdminTask,
  Organization,
} from './schemas'

const API_BASE = '/api/v1'

export class AuthError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

// Type-safe fetch with Zod validation
async function fetchWithAuth<T> (
  endpoint: string,
  schema: z.ZodSchema<T>,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const token = getToken()

  const hasBody = options.body !== undefined
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
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

  const json = await response.json()

  // Validate response with Zod schema
  const result = schema.safeParse(json)
  if (!result.success) {
    console.warn('API response validation failed:', result.error.issues)
    // Return parsed data anyway for backward compatibility
    // In production, you might want to throw here
  }

  return json as T
}

// Helper for endpoints that return { data: T } wrapper
async function fetchData<T> (
  endpoint: string,
  dataSchema: z.ZodSchema<T>,
  options: RequestInit = {}
): Promise<T> {
  const responseSchema = ApiResponse(dataSchema)
  const response = await fetchWithAuth(endpoint, responseSchema, options)
  return response.data ?? (response as unknown as T)
}

// ============================================
// Boards API
// ============================================

interface BoardsFilter {
  organization_id?: string
}

export async function getBoards (filter?: BoardsFilter): Promise<Board[]> {
  const params = new URLSearchParams()
  if (filter?.organization_id) {
    params.append('organization_id', filter.organization_id)
  }
  const queryString = params.toString()
  return fetchData(`/boards${queryString ? `?${queryString}` : ''}`, z.array(BoardSchema))
}

export async function getBoard (boardId: string): Promise<Board> {
  return fetchData(`/boards/${boardId}`, BoardSchema)
}

// ============================================
// Organizations API
// ============================================

export async function getOrganizations (): Promise<Organization[]> {
  return fetchData('/organizations', z.array(OrganizationSchema))
}

// ============================================
// Tasks API
// ============================================

interface TasksFilter {
  boardId?: string
  boardIds?: string[]
}

export async function getTasks (filter?: TasksFilter): Promise<Task[]> {
  if (filter?.boardIds && filter.boardIds.length > 0) {
    return fetchData(`/tasks?board_ids=${filter.boardIds.join(',')}`, z.array(TaskSchema))
  }
  if (filter?.boardId) {
    return fetchData(`/tasks?board_id=${filter.boardId}`, z.array(TaskSchema))
  }
  return fetchData('/tasks', z.array(TaskSchema))
}

export async function createTask (taskData: Partial<Task>): Promise<Task> {
  return fetchData('/tasks', TaskSchema, {
    method: 'POST',
    body: JSON.stringify(taskData),
  })
}

export async function updateTask (taskId: string, updates: Partial<Task>): Promise<Task> {
  return fetchData(`/tasks/${taskId}`, TaskSchema, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteTask (taskId: string): Promise<boolean> {
  await fetchWithAuth(`/tasks/${taskId}`, z.void(), { method: 'DELETE' })
  return true
}

export async function assignTask (taskId: string): Promise<Task> {
  return fetchData(`/tasks/${taskId}/assign`, TaskSchema, { method: 'PATCH' })
}

export async function claimTask (taskId: string): Promise<Task> {
  return fetchData(`/tasks/${taskId}/claim`, TaskSchema, { method: 'PATCH' })
}

export async function unclaimTask (taskId: string): Promise<Task> {
  return fetchData(`/tasks/${taskId}/unclaim`, TaskSchema, { method: 'PATCH' })
}

export async function completeTask (taskId: string): Promise<Task> {
  return fetchData(`/tasks/${taskId}`, TaskSchema, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  })
}

export async function getNextTask (): Promise<Task | null> {
  return fetchWithAuth('/tasks/next', TaskSchema.nullable())
}

// ============================================
// Agents API
// ============================================

export async function getAgents (): Promise<Agent[]> {
  return fetchData('/agents', z.array(AgentSchema))
}

// ============================================
// Archive API
// ============================================

interface ArchiveFilters {
  board_id?: string
  page?: number
  limit?: number
}

export async function getArchivedTasks (
  filters: ArchiveFilters = {}
): Promise<{ data?: ArchivedTask[]; meta?: { total: number; page: number; pages: number } }> {
  const params = new URLSearchParams()
  if (filters.board_id) params.append('board_id', filters.board_id)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.limit) params.append('limit', String(filters.limit))

  const queryString = params.toString()
  return fetchWithAuth(
    `/archives${queryString ? `?${queryString}` : ''}`,
    ApiResponse(z.array(ArchivedTaskSchema))
  )
}

export async function unarchiveTask (taskId: string): Promise<Task> {
  return fetchData(`/archives/${taskId}/unarchive`, TaskSchema, { method: 'PATCH' })
}

export async function scheduleArchive (taskId: string): Promise<Task> {
  return fetchData(`/archives/${taskId}/schedule`, TaskSchema, { method: 'PATCH' })
}

export async function deleteArchivedTask (taskId: string): Promise<boolean> {
  await fetchWithAuth(`/archives/${taskId}`, z.void(), { method: 'DELETE' })
  return true
}

// ============================================
// Workflows API
// ============================================

export async function getWorkflows (): Promise<Workflow[]> {
  return fetchData('/workflows', z.array(WorkflowSchema))
}

export async function getWorkflow (workflowId: string): Promise<Workflow> {
  return fetchData(`/workflows/${workflowId}`, WorkflowSchema)
}

export async function createWorkflow (workflowData: Partial<Workflow>): Promise<Workflow> {
  return fetchData('/workflows', WorkflowSchema, {
    method: 'POST',
    body: JSON.stringify(workflowData),
  })
}

export async function updateWorkflow (
  workflowId: string,
  updates: Partial<Workflow>
): Promise<Workflow> {
  return fetchData(`/workflows/${workflowId}`, WorkflowSchema, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteWorkflow (workflowId: string): Promise<boolean> {
  await fetchWithAuth(`/workflows/${workflowId}`, z.void(), { method: 'DELETE' })
  return true
}

export async function importWorkflowYaml (yamlString: string): Promise<Workflow> {
  return fetchData('/workflows/import-yaml', WorkflowSchema, {
    method: 'POST',
    body: JSON.stringify({ yaml: yamlString }),
  })
}

// ============================================
// Runs API
// ============================================

interface RunFilters {
  status?: string
  workflow_id?: string
  page?: number
  limit?: number
}

export async function getRuns (filters: RunFilters = {}): Promise<Run[]> {
  const params = new URLSearchParams()
  if (filters.status) params.append('status', filters.status)
  if (filters.workflow_id) params.append('workflow_id', filters.workflow_id)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.limit) params.append('limit', String(filters.limit))

  const queryString = params.toString()
  return fetchData(`/runs${queryString ? `?${queryString}` : ''}`, z.array(RunSchema))
}

export async function getRun (runId: string): Promise<Run> {
  return fetchData(`/runs/${runId}`, RunSchema)
}

export async function triggerRun (workflowId: string): Promise<Run> {
  return fetchData('/runs', RunSchema, {
    method: 'POST',
    body: JSON.stringify({ workflow_id: workflowId }),
  })
}

export async function cancelRun (runId: string): Promise<Run> {
  return fetchData(`/runs/${runId}/cancel`, RunSchema, { method: 'POST' })
}

// ============================================
// Settings API
// ============================================

export async function getSettings (): Promise<User> {
  return fetchWithAuth('/auth/me', UserSchema)
}

export async function updateSettings (data: Partial<User>): Promise<User> {
  return fetchWithAuth('/auth/me', UserSchema, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function updatePassword (
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  return fetchWithAuth(
    '/auth/me/password',
    z.object({ message: z.string() }),
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }
  )
}

export async function getApiToken (): Promise<ApiToken> {
  return fetchWithAuth('/auth/me/api-token', ApiTokenSchema)
}

export async function regenerateApiToken (): Promise<ApiToken> {
  return fetchWithAuth('/auth/me/api-token/regenerate', ApiTokenSchema, { method: 'POST' })
}

// ============================================
// OpenClaw Settings API
// ============================================

export async function getOpenClawSettings (): Promise<OpenClawSettings> {
  return fetchData('/settings/openclaw', OpenClawSettingsSchema)
}

export async function updateOpenClawSettings (data: {
  url?: string
  apiKey?: string
}): Promise<OpenClawSettings> {
  return fetchData('/settings/openclaw', OpenClawSettingsSchema, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function testOpenClawConnection (): Promise<{
  success: boolean
  message?: string
  error?: string
}> {
  return fetchData(
    '/settings/openclaw/test',
    z.object({
      success: z.boolean(),
      message: z.string().optional(),
      error: z.string().optional(),
    }),
    { method: 'POST' }
  )
}

export async function clearOpenClawApiKey (): Promise<void> {
  await fetchWithAuth('/settings/openclaw/api-key', z.void(), { method: 'DELETE' })
}

// ============================================
// Admin API
// ============================================

export async function getUsers (): Promise<User[]> {
  return fetchData('/admin/users', z.array(UserSchema))
}

export async function updateUser (userId: string, data: Partial<User>): Promise<User> {
  return fetchData(`/admin/users/${userId}`, UserSchema, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

interface AdminFilters {
  user_id?: string
  status?: string
  page?: number
  limit?: number
}

export async function getAdminBoards (
  filters: AdminFilters = {}
): Promise<{ data: AdminBoard[]; meta: { total: number; page: number; pages: number } }> {
  const params = new URLSearchParams()
  if (filters.page) params.append('page', String(filters.page))
  if (filters.limit) params.append('limit', String(filters.limit))

  const queryString = params.toString()
  return fetchWithAuth(
    `/admin/boards${queryString ? `?${queryString}` : ''}`,
    AdminListResponse(AdminBoardSchema)
  )
}

export async function getAdminTasks (
  filters: AdminFilters = {}
): Promise<{ data: AdminTask[]; meta: { total: number; page: number; pages: number } }> {
  const params = new URLSearchParams()
  if (filters.user_id) params.append('user_id', filters.user_id)
  if (filters.status) params.append('status', filters.status)
  if (filters.page) params.append('page', String(filters.page))
  if (filters.limit) params.append('limit', String(filters.limit))

  const queryString = params.toString()
  return fetchWithAuth(
    `/admin/tasks${queryString ? `?${queryString}` : ''}`,
    AdminListResponse(AdminTaskSchema)
  )
}

// ============================================
// Dashboard API
// ============================================

export interface DashboardData {
  boards: Board[]
  agents: Agent[]
  taskCounts: {
    total: number
    inbox: number
    up_next: number
    in_progress: number
    in_review: number
    done: number
  }
  priorityCounts: {
    high: number
    medium: number
    low: number
    none: number
  }
  tasksPerBoard: Record<string, number>
  assignedCount: number
}

const DashboardSchema = z.object({
  boards: z.array(BoardSchema),
  agents: z.array(AgentSchema),
  taskCounts: z.object({
    total: z.number(),
    inbox: z.number(),
    up_next: z.number(),
    in_progress: z.number(),
    in_review: z.number(),
    done: z.number(),
  }),
  priorityCounts: z.object({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    none: z.number(),
  }),
  tasksPerBoard: z.record(z.string(), z.number()),
  assignedCount: z.number(),
})

export async function getDashboard (): Promise<DashboardData> {
  // Dashboard endpoint returns data directly without { success, data } wrapper
  const response = await fetchWithAuth('/dashboard', DashboardSchema)
  return response ?? { boards: [], agents: [], taskCounts: { total: 0, inbox: 0, up_next: 0, in_progress: 0, in_review: 0, done: 0 }, priorityCounts: { high: 0, medium: 0, low: 0, none: 0 }, tasksPerBoard: {}, assignedCount: 0 }
}

// Re-export types for backward compatibility
export type {
  Board,
  Task,
  Agent,
  Workflow,
  Run,
  User,
  ArchivedTask,
  ApiToken,
  OpenClawSettings,
  AdminBoard,
  AdminTask,
}
