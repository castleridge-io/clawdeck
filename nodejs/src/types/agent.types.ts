import type { Agent, Board } from '@prisma/client'

/**
 * Agent data returned in API responses
 */
export interface AgentResponse {
  id: string
  uuid: string
  name: string
  slug: string
  emoji: string
  color: string
  description: string | null
  is_active: boolean
  boards: Array<{
    id: string
    name: string
    icon: string
    color: string
  }>
  position: number
  created_at: string
  updated_at: string
}

/**
 * Agent with included boards from Prisma query
 */
export type AgentWithBoards = Agent & {
  boards: Pick<Board, 'id' | 'name' | 'icon' | 'color'>[]
}

/**
 * Data for creating a new agent
 */
export interface CreateAgentData {
  name: string
  slug: string
  emoji?: string
  color?: string
  description?: string
  position?: number
}

/**
 * Data for registering an existing agent with UUID
 */
export interface RegisterAgentData {
  uuid: string
  name: string
  slug: string
  emoji?: string
  color?: string
  description?: string
}

/**
 * Data for updating an agent
 */
export interface UpdateAgentData {
  name?: string
  slug?: string
  emoji?: string
  color?: string
  description?: string
  position?: number
}

/**
 * Options for listing agents
 */
export interface ListAgentsOptions {
  includeInactive?: boolean
}

/**
 * Options for getting a single agent
 */
export interface GetAgentOptions {
  includeInactive?: boolean
}

/**
 * Agent service configuration options
 */
export interface AgentServiceOptions {
  openclawRegisterUrl?: string
  openclawApiKey?: string
}

/**
 * Custom error with status code
 */
export interface ServiceError extends Error {
  code: string
  status: number
}

/**
 * Create a service error
 */
export function createServiceError (message: string, code: string, status: number): ServiceError {
  const error = new Error(message) as ServiceError
  error.code = code
  error.status = status
  return error
}
