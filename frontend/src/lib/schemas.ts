import { z } from 'zod'

// Task Status
export const TaskStatusSchema = z.enum(['inbox', 'up_next', 'in_progress', 'in_review', 'done'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

// Run Status
export const RunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled'])
export type RunStatus = z.infer<typeof RunStatusSchema>

// User
export const UserSchema = z.object({
  id: z.string(),
  emailAddress: z.string(),
  admin: z.boolean(),
  agentAutoMode: z.boolean(),
  agentName: z.string().nullable(),
  agentEmoji: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().optional(),
  agentLastActiveAt: z.string().nullable().optional(),
})
export type User = z.infer<typeof UserSchema>

// Board
export const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  position: z.number().optional(),
  agent_id: z.string().nullable().optional(),
  user_id: z.string().optional(),
  organization_id: z.string().optional(),
  organization_name: z.string().optional(),
  owner_email: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type Board = z.infer<typeof BoardSchema>

// Organization
export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
})
export type Organization = z.infer<typeof OrganizationSchema>

// Task
export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  board_id: z.string(),
  assignee_id: z.string().optional(),
  claimed_by: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  completed_at: z.string().optional(),
  archived_at: z.string().optional(),
})
export type Task = z.infer<typeof TaskSchema>

// Agent
export const AgentSchema = z.object({
  id: z.string(),
  uuid: z.string(),
  name: z.string(),
  emoji: z.string(),
  color: z.string(),
  slug: z.string(),
  status: z.enum(['active', 'idle', 'offline']).optional(),
  lastActiveAt: z.string().optional(),
})
export type Agent = z.infer<typeof AgentSchema>

// Workflow Step
export const WorkflowStepSchema = z.object({
  id: z.string().optional(),
  stepId: z.string(),
  name: z.string().nullable().optional(),
  agentId: z.string(),
  inputTemplate: z.string(),
  expects: z.string(),
  type: z.enum(['single', 'loop', 'approval']),
  loopConfig: z.record(z.unknown()).nullable().optional(),
  position: z.number(),
})
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

// Workflow
export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(WorkflowStepSchema).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type Workflow = z.infer<typeof WorkflowSchema>

// Run
export const RunSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  workflow: WorkflowSchema.optional(),
  status: RunStatusSchema,
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  created_at: z.string().optional(),
})
export type Run = z.infer<typeof RunSchema>

// Archived Task
export const ArchivedTaskSchema = TaskSchema.extend({
  archived_at: z.string(),
  completed_at: z.string(),
})
export type ArchivedTask = z.infer<typeof ArchivedTaskSchema>

// API Token
export const ApiTokenSchema = z.object({
  token: z.string(),
  name: z.string().optional(),
  lastUsedAt: z.string().optional(),
  createdAt: z.string().optional(),
})
export type ApiToken = z.infer<typeof ApiTokenSchema>

// Owner Info (for Admin)
export const OwnerInfoSchema = z.object({
  id: z.string(),
  emailAddress: z.string(),
  agentName: z.string().nullable(),
})
export type OwnerInfo = z.infer<typeof OwnerInfoSchema>

// Admin Board
export const AdminBoardSchema = BoardSchema.extend({
  owner: OwnerInfoSchema,
  task_count: z.number(),
  created_at: z.string(),
})
export type AdminBoard = z.infer<typeof AdminBoardSchema>

// Admin Task
export const AdminTaskSchema = TaskSchema.extend({
  owner: OwnerInfoSchema.nullable(),
  board: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  created_at: z.string(),
})
export type AdminTask = z.infer<typeof AdminTaskSchema>

// API Response wrapper
export function ApiResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: schema.optional(),
    meta: z
      .object({
        total: z.number(),
        page: z.number(),
        pages: z.number(),
      })
      .optional(),
    error: z.string().optional(),
  })
}

// List response for admin endpoints
export function AdminListResponse<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    success: z.boolean(),
    data: z.array(schema),
    meta: z.object({
      total: z.number(),
      page: z.number(),
      pages: z.number(),
    }),
  })
}

// OpenClaw Settings
export const OpenClawSettingsSchema = z.object({
  url: z.string(),
  apiKey: z.string(),
  hasApiKey: z.boolean(),
  connected: z.boolean(),
  lastChecked: z.string().nullable(),
})
export type OpenClawSettings = z.infer<typeof OpenClawSettingsSchema>
