export interface User {
  id: string
  emailAddress: string
  admin: boolean
  agentAutoMode: boolean
  agentName: string | null
  agentEmoji: string | null
  avatarUrl: string | null
  createdAt?: string
  agentLastActiveAt?: string | null
}

export interface Board {
  id: string
  name: string
  icon?: string
  color?: string
  position?: number
  agent_id?: string | null
  user_id?: string
  organization_id?: string
  organization_name?: string
  owner_email?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Task {
  id: string
  name: string
  description?: string
  status: TaskStatus
  board_id: string
  assignee_id?: string
  claimed_by?: string
  created_at?: string
  updated_at?: string
  completed_at?: string
  archived_at?: string
}

export type TaskStatus = 'inbox' | 'up_next' | 'in_progress' | 'in_review' | 'done'

export interface Agent {
  id: string
  uuid: string
  name: string
  emoji: string
  color: string
  slug: string
  status?: 'active' | 'idle' | 'offline'
  lastActiveAt?: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  steps?: WorkflowStep[]
  createdAt?: string
  updatedAt?: string
}

export interface WorkflowStep {
  id?: string
  stepId: string
  name?: string | null
  agentId: string
  inputTemplate: string
  expects: string
  type: 'single' | 'loop' | 'approval'
  loopConfig?: Record<string, unknown> | null
  position: number
}

export interface Run {
  id: string
  workflow_id: string
  workflow?: Workflow
  status: RunStatus
  started_at?: string
  completed_at?: string
  created_at?: string
}

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ArchivedTask extends Task {
  archived_at: string
  completed_at: string
}

export interface ApiToken {
  token: string
  name?: string
  lastUsedAt?: string
  createdAt?: string
}

export interface AuthContextValue {
  user: User | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

export interface Column {
  id: TaskStatus
  name: string
  color: string
}

// Admin types
export interface OwnerInfo {
  id: string
  emailAddress: string
  agentName: string | null
}

export interface AdminBoard extends Board {
  owner: OwnerInfo
  task_count: number
  created_at: string
}

export interface AdminTask extends Task {
  owner: OwnerInfo | null
  board: { id: string; name: string } | null
  created_at: string
}

export interface AdminFilters {
  user_id?: string
  status?: string
  page?: number
  limit?: number
}

export interface AdminListResponse<T> {
  success: boolean
  data: T[]
  meta: {
    total: number
    page: number
    pages: number
  }
}
