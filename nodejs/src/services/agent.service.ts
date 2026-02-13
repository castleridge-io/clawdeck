import { prisma } from '../db/prisma.js'
import type {
  AgentServiceOptions,
  AgentWithBoards,
  CreateAgentData,
  RegisterAgentData,
  UpdateAgentData,
  ListAgentsOptions,
  GetAgentOptions,
  ServiceError,
} from '../types/agent.types.js'
import { createServiceError } from '../types/agent.types.js'

/**
 * Create agent service
 */
export function createAgentService (options: AgentServiceOptions = {}) {
  const { openclawRegisterUrl, openclawApiKey } = options

  /**
   * Register agent with OpenClaw (if configured)
   */
  async function registerWithOpenClaw (agent: AgentWithBoards): Promise<unknown | null> {
    if (!openclawRegisterUrl) {
      return null
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (openclawApiKey) {
        headers['Authorization'] = `Bearer ${openclawApiKey}`
      }

      const response = await fetch(openclawRegisterUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          uuid: agent.uuid,
          name: agent.name,
          slug: agent.slug,
          emoji: agent.emoji,
          color: agent.color,
          description: agent.description,
        }),
      })

      if (!response.ok) {
        console.error(`OpenClaw registration failed: ${response.status} ${response.statusText}`)
        return null
      }

      return await response.json()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('OpenClaw registration error:', message)
      return null
    }
  }

  /**
   * Unregister agent with OpenClaw (if configured)
   */
  async function unregisterWithOpenClaw (uuid: string): Promise<boolean | null> {
    if (!openclawRegisterUrl) {
      return null
    }

    try {
      const headers: Record<string, string> = {}
      if (openclawApiKey) {
        headers['Authorization'] = `Bearer ${openclawApiKey}`
      }

      const response = await fetch(`${openclawRegisterUrl}/${uuid}`, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok && response.status !== 404) {
        console.error(`OpenClaw unregistration failed: ${response.status} ${response.statusText}`)
        return null
      }

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('OpenClaw unregistration error:', message)
      return null
    }
  }

  return {
    /**
     * List all active agents
     */
    async listAgents (opts: ListAgentsOptions = {}): Promise<AgentWithBoards[]> {
      const { includeInactive = false } = opts
      return (await prisma.agent.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { position: 'asc' },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      })) as AgentWithBoards[]
    },

    /**
     * Get agent by UUID
     */
    async getAgentByUuid (
      uuid: string,
      opts: GetAgentOptions = {}
    ): Promise<AgentWithBoards | null> {
      const { includeInactive = false } = opts
      return (await prisma.agent.findFirst({
        where: {
          uuid,
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      })) as AgentWithBoards | null
    },

    /**
     * Get agent by slug
     */
    async getAgentBySlug (
      slug: string,
      opts: GetAgentOptions = {}
    ): Promise<AgentWithBoards | null> {
      const { includeInactive = false } = opts
      return (await prisma.agent.findFirst({
        where: {
          slug,
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      })) as AgentWithBoards | null
    },

    /**
     * Create a new agent
     */
    async createAgent (data: CreateAgentData): Promise<AgentWithBoards> {
      const { name, slug, emoji = '🤖', color = 'gray', description, position = 0 } = data

      // Check for duplicate name
      const existingByName = await prisma.agent.findUnique({
        where: { name },
      })
      if (existingByName) {
        throw createServiceError('Agent with this name already exists', 'DUPLICATE_NAME', 409)
      }

      // Check for duplicate slug
      const existingBySlug = await prisma.agent.findUnique({
        where: { slug },
      })
      if (existingBySlug) {
        throw createServiceError('Agent with this slug already exists', 'DUPLICATE_SLUG', 409)
      }

      const agent = await prisma.agent.create({
        data: {
          name,
          slug,
          emoji,
          color,
          description,
          position,
        },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      })

      // Register with OpenClaw (async, don't wait)
      registerWithOpenClaw(agent as AgentWithBoards).catch(() => {})

      return agent as AgentWithBoards
    },

    /**
     * Register an existing agent from OpenClaw with a pre-existing UUID
     */
    async registerAgent (data: RegisterAgentData): Promise<AgentWithBoards> {
      const { uuid, name, slug, emoji = '🤖', color = 'gray', description } = data

      // Check for duplicate UUID
      const existingByUuid = await prisma.agent.findUnique({
        where: { uuid },
      })
      if (existingByUuid) {
        throw createServiceError('Agent with this UUID already exists', 'DUPLICATE_UUID', 409)
      }

      // Check for duplicate name
      const existingByName = await prisma.agent.findUnique({
        where: { name },
      })
      if (existingByName) {
        throw createServiceError('Agent with this name already exists', 'DUPLICATE_NAME', 409)
      }

      // Check for duplicate slug
      const existingBySlug = await prisma.agent.findUnique({
        where: { slug },
      })
      if (existingBySlug) {
        throw createServiceError('Agent with this slug already exists', 'DUPLICATE_SLUG', 409)
      }

      const agent = await prisma.agent.create({
        data: {
          uuid, // Use provided UUID instead of auto-generated
          name,
          slug,
          emoji,
          color,
          description,
        },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      })

      return agent as AgentWithBoards
    },

    /**
     * Update an agent
     */
    async updateAgent (uuid: string, data: UpdateAgentData): Promise<AgentWithBoards> {
      // Find the agent first
      const agent = await prisma.agent.findFirst({
        where: { uuid, isActive: true },
      })

      if (!agent) {
        throw createServiceError('Agent not found', 'NOT_FOUND', 404)
      }

      const updateData: {
        name?: string
        slug?: string
        emoji?: string
        color?: string
        description?: string | null
        position?: number
      } = {}

      // Handle name update (check for duplicates)
      if (data.name !== undefined && data.name !== agent.name) {
        const existingByName = await prisma.agent.findUnique({
          where: { name: data.name },
        })
        if (existingByName && existingByName.id !== agent.id) {
          throw createServiceError('Agent with this name already exists', 'DUPLICATE_NAME', 409)
        }
        updateData.name = data.name
      }

      // Handle slug update (check for duplicates)
      if (data.slug !== undefined && data.slug !== agent.slug) {
        const existingBySlug = await prisma.agent.findUnique({
          where: { slug: data.slug },
        })
        if (existingBySlug && existingBySlug.id !== agent.id) {
          throw createServiceError('Agent with this slug already exists', 'DUPLICATE_SLUG', 409)
        }
        updateData.slug = data.slug
      }

      // Handle other fields
      if (data.emoji !== undefined) updateData.emoji = data.emoji
      if (data.color !== undefined) updateData.color = data.color
      if (data.description !== undefined) updateData.description = data.description
      if (data.position !== undefined) updateData.position = data.position

      const updated = await prisma.agent.update({
        where: { id: agent.id },
        data: updateData,
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      })

      return updated as AgentWithBoards
    },

    /**
     * Soft delete an agent (sets isActive = false)
     */
    async deleteAgent (uuid: string): Promise<boolean> {
      // Find the agent first
      const agent = await prisma.agent.findFirst({
        where: { uuid, isActive: true },
      })

      if (!agent) {
        throw createServiceError('Agent not found', 'NOT_FOUND', 404)
      }

      // Soft delete
      await prisma.agent.update({
        where: { id: agent.id },
        data: { isActive: false },
      })

      // Unregister with OpenClaw (async, don't wait)
      unregisterWithOpenClaw(uuid).catch(() => {})

      return true
    },

    /**
     * Hard delete an agent (permanent)
     */
    async hardDeleteAgent (uuid: string): Promise<boolean> {
      const agent = await prisma.agent.findUnique({
        where: { uuid },
      })

      if (!agent) {
        throw createServiceError('Agent not found', 'NOT_FOUND', 404)
      }

      await prisma.agent.delete({
        where: { id: agent.id },
      })

      // Unregister with OpenClaw (async, don't wait)
      unregisterWithOpenClaw(uuid).catch(() => {})

      return true
    },

    /**
     * Restore a soft-deleted agent
     */
    async restoreAgent (uuid: string): Promise<AgentWithBoards> {
      const agent = await prisma.agent.findFirst({
        where: { uuid, isActive: false },
      })

      if (!agent) {
        throw createServiceError('Agent not found or already active', 'NOT_FOUND', 404)
      }

      const restored = await prisma.agent.update({
        where: { id: agent.id },
        data: { isActive: true },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
            },
          },
        },
      })

      return restored as AgentWithBoards
    },
  }
}

// Re-export types for convenience
export type { AgentServiceOptions, AgentWithBoards, ServiceError }
