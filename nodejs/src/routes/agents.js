import { authenticateRequest, authenticateAdmin } from '../middleware/auth.js'
import { createAgentService } from '../services/agent.service.js'

/**
 * Compute agent status based on lastActiveAt
 * - active: last active within 5 minutes
 * - idle: last active within 30 minutes
 * - offline: last active more than 30 minutes ago or never
 */
function computeAgentStatus(lastActiveAt) {
  if (!lastActiveAt) return 'offline'

  const now = new Date()
  const lastActive = new Date(lastActiveAt)
  const diffMs = now.getTime() - lastActive.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 5) return 'active'
  if (diffMins < 30) return 'idle'
  return 'offline'
}

/**
 * Convert agent model to JSON response format
 */
function agentToJson(agent) {
  const status = computeAgentStatus(agent.lastActiveAt)

  return {
    id: agent.id.toString(),
    uuid: agent.uuid,
    name: agent.name,
    slug: agent.slug,
    emoji: agent.emoji,
    color: agent.color,
    description: agent.description,
    is_active: agent.isActive,
    status,
    lastActiveAt: agent.lastActiveAt ? agent.lastActiveAt.toISOString() : null,
    boards: (agent.boards || []).map(board => ({
      id: board.id.toString(),
      name: board.name,
      icon: board.icon,
      color: board.color
    })),
    position: agent.position,
    created_at: agent.createdAt.toISOString(),
    updated_at: agent.updatedAt.toISOString()
  }
}

export async function agentsRoutes(fastify, opts) {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // Create agent service with OpenClaw config from environment
  const agentService = createAgentService({
    openclawRegisterUrl: process.env.OPENCLAW_REGISTER_URL,
    openclawApiKey: process.env.OPENCLAW_API_KEY
  })

  // GET /api/v1/agents - List all active agents
  fastify.get('/', async (request) => {
    const agents = await agentService.listAgents()

    return {
      success: true,
      data: agents.map(agentToJson)
    }
  })

  // GET /api/v1/agents/:uuid - Get single agent by UUID
  fastify.get('/:uuid', async (request, reply) => {
    const agent = await agentService.getAgentByUuid(request.params.uuid)

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' })
    }

    return {
      success: true,
      data: agentToJson(agent)
    }
  })

  // POST /api/v1/agents - Create agent (admin only)
  fastify.post('/', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { name, slug, emoji, color, description, position } = request.body

    // Validate required fields
    if (!name) {
      return reply.code(400).send({ error: 'name is required' })
    }
    if (!slug) {
      return reply.code(400).send({ error: 'slug is required' })
    }

    try {
      const agent = await agentService.createAgent({
        name,
        slug,
        emoji,
        color,
        description,
        position
      })

      return reply.code(201).send({
        success: true,
        data: agentToJson(agent)
      })
    } catch (error) {
      if (error.status === 409) {
        return reply.code(409).send({ error: error.message })
      }
      if (error.status === 404) {
        return reply.code(404).send({ error: error.message })
      }
      throw error
    }
  })

  // PATCH /api/v1/agents/:uuid - Update agent (admin only)
  fastify.patch('/:uuid', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { name, slug, emoji, color, description, position } = request.body

    try {
      const agent = await agentService.updateAgent(request.params.uuid, {
        name,
        slug,
        emoji,
        color,
        description,
        position
      })

      return {
        success: true,
        data: agentToJson(agent)
      }
    } catch (error) {
      if (error.status === 404) {
        return reply.code(404).send({ error: 'Agent not found' })
      }
      if (error.status === 409) {
        return reply.code(409).send({ error: error.message })
      }
      throw error
    }
  })

  // DELETE /api/v1/agents/:uuid - Soft delete agent (admin only)
  fastify.delete('/:uuid', { preHandler: authenticateAdmin }, async (request, reply) => {
    try {
      await agentService.deleteAgent(request.params.uuid)
      return reply.code(204).send()
    } catch (error) {
      if (error.status === 404) {
        return reply.code(404).send({ error: 'Agent not found' })
      }
      throw error
    }
  })

  // POST /api/v1/agents/register - Register existing agent from OpenClaw (admin only)
  // This allows OpenClaw to register an agent with a pre-existing UUID
  fastify.post('/register', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { uuid, name, slug, emoji, color, description } = request.body

    // Validate required fields
    if (!uuid) {
      return reply.code(400).send({ error: 'uuid is required' })
    }
    if (!name) {
      return reply.code(400).send({ error: 'name is required' })
    }
    if (!slug) {
      return reply.code(400).send({ error: 'slug is required' })
    }

    try {
      const agent = await agentService.registerAgent({
        uuid,
        name,
        slug,
        emoji,
        color,
        description
      })

      return reply.code(201).send({
        success: true,
        data: agentToJson(agent)
      })
    } catch (error) {
      if (error.status === 409) {
        return reply.code(409).send({ error: error.message })
      }
      throw error
    }
  })
}
