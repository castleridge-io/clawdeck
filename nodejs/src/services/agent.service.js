import { prisma } from '../db/prisma.js'

/**
 * Create agent service
 * @param {object} options - Configuration options
 * @param {string} [options.openclawRegisterUrl] - URL for OpenClaw agent registration
 * @param {string} [options.openclawApiKey] - API key for OpenClaw
 */
export function createAgentService(options = {}) {
  const { openclawRegisterUrl, openclawApiKey } = options

  /**
   * Register agent with OpenClaw (if configured)
   */
  async function registerWithOpenClaw(agent) {
    if (!openclawRegisterUrl) {
      return null
    }

    try {
      const response = await fetch(openclawRegisterUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(openclawApiKey ? { 'Authorization': `Bearer ${openclawApiKey}` } : {})
        },
        body: JSON.stringify({
          uuid: agent.uuid,
          name: agent.name,
          slug: agent.slug,
          emoji: agent.emoji,
          color: agent.color,
          description: agent.description
        })
      })

      if (!response.ok) {
        console.error(`OpenClaw registration failed: ${response.status} ${response.statusText}`)
        return null
      }

      return await response.json()
    } catch (error) {
      console.error('OpenClaw registration error:', error.message)
      return null
    }
  }

  /**
   * Unregister agent with OpenClaw (if configured)
   */
  async function unregisterWithOpenClaw(uuid) {
    if (!openclawRegisterUrl) {
      return null
    }

    try {
      const response = await fetch(`${openclawRegisterUrl}/${uuid}`, {
        method: 'DELETE',
        headers: {
          ...(openclawApiKey ? { 'Authorization': `Bearer ${openclawApiKey}` } : {})
        }
      })

      if (!response.ok && response.status !== 404) {
        console.error(`OpenClaw unregistration failed: ${response.status} ${response.statusText}`)
        return null
      }

      return true
    } catch (error) {
      console.error('OpenClaw unregistration error:', error.message)
      return null
    }
  }

  return {
    /**
     * List all active agents
     * @param {object} options - Query options
     * @param {boolean} [options.includeInactive=false] - Include inactive agents
     * @returns {Promise<Array>} List of agents
     */
    async listAgents({ includeInactive = false } = {}) {
      return await prisma.agent.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { position: 'asc' },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true
            }
          }
        }
      })
    },

    /**
     * Get agent by UUID
     * @param {string} uuid - Agent UUID
     * @param {object} options - Query options
     * @param {boolean} [options.includeInactive=false] - Include inactive agents
     * @returns {Promise<object|null>} Agent or null if not found
     */
    async getAgentByUuid(uuid, { includeInactive = false } = {}) {
      return await prisma.agent.findFirst({
        where: {
          uuid,
          ...(includeInactive ? {} : { isActive: true })
        },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true
            }
          }
        }
      })
    },

    /**
     * Get agent by slug
     * @param {string} slug - Agent slug
     * @param {object} options - Query options
     * @param {boolean} [options.includeInactive=false] - Include inactive agents
     * @returns {Promise<object|null>} Agent or null if not found
     */
    async getAgentBySlug(slug, { includeInactive = false } = {}) {
      return await prisma.agent.findFirst({
        where: {
          slug,
          ...(includeInactive ? {} : { isActive: true })
        }
      })
    },

    /**
     * Create a new agent
     * @param {object} data - Agent data
     * @param {string} data.name - Agent name (required)
     * @param {string} data.slug - Agent slug (required, unique)
     * @param {string} [data.emoji='🤖'] - Agent emoji
     * @param {string} [data.color='gray'] - Agent color
     * @param {string} [data.description] - Agent description
     * @param {number} [data.position=0] - Display position
     * @returns {Promise<object>} Created agent
     */
    async createAgent(data) {
      const {
        name,
        slug,
        emoji = '🤖',
        color = 'gray',
        description,
        position = 0
      } = data

      // Check for duplicate name
      const existingByName = await prisma.agent.findUnique({
        where: { name }
      })
      if (existingByName) {
        const error = new Error('Agent with this name already exists')
        error.code = 'DUPLICATE_NAME'
        error.status = 409
        throw error
      }

      // Check for duplicate slug
      const existingBySlug = await prisma.agent.findUnique({
        where: { slug }
      })
      if (existingBySlug) {
        const error = new Error('Agent with this slug already exists')
        error.code = 'DUPLICATE_SLUG'
        error.status = 409
        throw error
      }

      const agent = await prisma.agent.create({
        data: {
          name,
          slug,
          emoji,
          color,
          description,
          position
        },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true
            }
          }
        }
      })

      // Register with OpenClaw (async, don't wait)
      registerWithOpenClaw(agent).catch(() => {})

      return agent
    },

    /**
     * Register an existing agent from OpenClaw with a pre-existing UUID
     * @param {object} data - Agent data
     * @param {string} data.uuid - Agent UUID (required, from OpenClaw)
     * @param {string} data.name - Agent name (required)
     * @param {string} data.slug - Agent slug (required, unique)
     * @param {string} [data.emoji='🤖'] - Agent emoji
     * @param {string} [data.color='gray'] - Agent color
     * @param {string} [data.description] - Agent description
     * @returns {Promise<object>} Registered agent
     */
    async registerAgent(data) {
      const {
        uuid,
        name,
        slug,
        emoji = '🤖',
        color = 'gray',
        description
      } = data

      // Check for duplicate UUID
      const existingByUuid = await prisma.agent.findUnique({
        where: { uuid }
      })
      if (existingByUuid) {
        const error = new Error('Agent with this UUID already exists')
        error.code = 'DUPLICATE_UUID'
        error.status = 409
        throw error
      }

      // Check for duplicate name
      const existingByName = await prisma.agent.findUnique({
        where: { name }
      })
      if (existingByName) {
        const error = new Error('Agent with this name already exists')
        error.code = 'DUPLICATE_NAME'
        error.status = 409
        throw error
      }

      // Check for duplicate slug
      const existingBySlug = await prisma.agent.findUnique({
        where: { slug }
      })
      if (existingBySlug) {
        const error = new Error('Agent with this slug already exists')
        error.code = 'DUPLICATE_SLUG'
        error.status = 409
        throw error
      }

      const agent = await prisma.agent.create({
        data: {
          uuid, // Use provided UUID instead of auto-generated
          name,
          slug,
          emoji,
          color,
          description
        },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true
            }
          }
        }
      })

      return agent
    },

    /**
     * Update an agent
     * @param {string} uuid - Agent UUID
     * @param {object} data - Update data
     * @returns {Promise<object>} Updated agent
     */
    async updateAgent(uuid, data) {
      // Find the agent first
      const agent = await prisma.agent.findFirst({
        where: { uuid, isActive: true }
      })

      if (!agent) {
        const error = new Error('Agent not found')
        error.code = 'NOT_FOUND'
        error.status = 404
        throw error
      }

      const updateData = {}

      // Handle name update (check for duplicates)
      if (data.name !== undefined && data.name !== agent.name) {
        const existingByName = await prisma.agent.findUnique({
          where: { name: data.name }
        })
        if (existingByName && existingByName.id !== agent.id) {
          const error = new Error('Agent with this name already exists')
          error.code = 'DUPLICATE_NAME'
          error.status = 409
          throw error
        }
        updateData.name = data.name
      }

      // Handle slug update (check for duplicates)
      if (data.slug !== undefined && data.slug !== agent.slug) {
        const existingBySlug = await prisma.agent.findUnique({
          where: { slug: data.slug }
        })
        if (existingBySlug && existingBySlug.id !== agent.id) {
          const error = new Error('Agent with this slug already exists')
          error.code = 'DUPLICATE_SLUG'
          error.status = 409
          throw error
        }
        updateData.slug = data.slug
      }

      // Handle other fields
      if (data.emoji !== undefined) updateData.emoji = data.emoji
      if (data.color !== undefined) updateData.color = data.color
      if (data.description !== undefined) updateData.description = data.description
      if (data.position !== undefined) updateData.position = data.position

      return await prisma.agent.update({
        where: { id: agent.id },
        data: updateData,
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true
            }
          }
        }
      })
    },

    /**
     * Soft delete an agent (sets isActive = false)
     * @param {string} uuid - Agent UUID
     * @returns {Promise<boolean>} True if deleted
     */
    async deleteAgent(uuid) {
      // Find the agent first
      const agent = await prisma.agent.findFirst({
        where: { uuid, isActive: true }
      })

      if (!agent) {
        const error = new Error('Agent not found')
        error.code = 'NOT_FOUND'
        error.status = 404
        throw error
      }

      // Soft delete
      await prisma.agent.update({
        where: { id: agent.id },
        data: { isActive: false }
      })

      // Unregister with OpenClaw (async, don't wait)
      unregisterWithOpenClaw(uuid).catch(() => {})

      return true
    },

    /**
     * Hard delete an agent (permanent)
     * @param {string} uuid - Agent UUID
     * @returns {Promise<boolean>} True if deleted
     */
    async hardDeleteAgent(uuid) {
      const agent = await prisma.agent.findUnique({
        where: { uuid }
      })

      if (!agent) {
        const error = new Error('Agent not found')
        error.code = 'NOT_FOUND'
        error.status = 404
        throw error
      }

      await prisma.agent.delete({
        where: { id: agent.id }
      })

      // Unregister with OpenClaw (async, don't wait)
      unregisterWithOpenClaw(uuid).catch(() => {})

      return true
    },

    /**
     * Restore a soft-deleted agent
     * @param {string} uuid - Agent UUID
     * @returns {Promise<object>} Restored agent
     */
    async restoreAgent(uuid) {
      const agent = await prisma.agent.findFirst({
        where: { uuid, isActive: false }
      })

      if (!agent) {
        const error = new Error('Agent not found or already active')
        error.code = 'NOT_FOUND'
        error.status = 404
        throw error
      }

      return await prisma.agent.update({
        where: { id: agent.id },
        data: { isActive: true },
        include: {
          boards: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true
            }
          }
        }
      })
    }
  }
}
