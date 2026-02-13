import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateRequest, authenticateAdmin } from '../middleware/auth.js'
import { createAgentService } from '../services/agent.service.js'
import type { AgentResponse, AgentWithBoards } from '../types/agent.types.js'

/**
 * Convert agent model to JSON response format
 */
function agentToJson(agent: AgentWithBoards): AgentResponse {
  return {
    id: agent.id.toString(),
    uuid: agent.uuid,
    name: agent.name,
    slug: agent.slug,
    emoji: agent.emoji,
    color: agent.color,
    description: agent.description,
    is_active: agent.isActive,
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

interface AgentParams {
  uuid: string
}

interface CreateAgentBody {
  name: string
  slug: string
  emoji?: string
  color?: string
  description?: string
  position?: number
}

interface RegisterAgentBody {
  uuid: string
  name: string
  slug: string
  emoji?: string
  color?: string
  description?: string
}

interface UpdateAgentBody {
  name?: string
  slug?: string
  emoji?: string
  color?: string
  description?: string
  position?: number
}

export async function agentsRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // Create agent service with OpenClaw config from environment
  const agentService = createAgentService({
    openclawRegisterUrl: process.env.OPENCLAW_REGISTER_URL,
    openclawApiKey: process.env.OPENCLAW_API_KEY
  })

  // GET /api/v1/agents - List all active agents
  fastify.get('/', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const agents = await agentService.listAgents()

    return {
      success: true,
      data: agents.map(agentToJson)
    }
  })

  // GET /api/v1/agents/:uuid - Get single agent by UUID
  fastify.get<{ Params: AgentParams }>(
    '/:uuid',
    async (request: FastifyRequest<{ Params: AgentParams }>, reply: FastifyReply) => {
      const { uuid } = request.params
      const agent = await agentService.getAgentByUuid(uuid)

      if (!agent) {
        return reply.code(404).send({ error: 'Agent not found' })
      }

      return {
        success: true,
        data: agentToJson(agent)
      }
    }
  )

  // POST /api/v1/agents - Create agent (admin only)
  fastify.post<{ Body: CreateAgentBody }>(
    '/',
    { preHandler: authenticateAdmin },
    async (
      request: FastifyRequest<{ Body: CreateAgentBody }>,
      reply: FastifyReply
    ) => {
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
        const err = error as { status?: number; message?: string }
        if (err.status === 409) {
          return reply.code(409).send({ error: err.message })
        }
        if (err.status === 404) {
          return reply.code(404).send({ error: err.message })
        }
        throw error
      }
    }
  )

  // PATCH /api/v1/agents/:uuid - Update agent (admin only)
  fastify.patch<{ Params: AgentParams; Body: UpdateAgentBody }>(
    '/:uuid',
    { preHandler: authenticateAdmin },
    async (
      request: FastifyRequest<{ Params: AgentParams; Body: UpdateAgentBody }>,
      reply: FastifyReply
    ) => {
      const { uuid } = request.params
      const { name, slug, emoji, color, description, position } = request.body

      try {
        const agent = await agentService.updateAgent(uuid, {
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
        const err = error as { status?: number; message?: string }
        if (err.status === 404) {
          return reply.code(404).send({ error: 'Agent not found' })
        }
        if (err.status === 409) {
          return reply.code(409).send({ error: err.message })
        }
        throw error
      }
    }
  )

  // DELETE /api/v1/agents/:uuid - Soft delete agent (admin only)
  fastify.delete<{ Params: AgentParams }>(
    '/:uuid',
    { preHandler: authenticateAdmin },
    async (
      request: FastifyRequest<{ Params: AgentParams }>,
      reply: FastifyReply
    ) => {
      const { uuid } = request.params

      try {
        await agentService.deleteAgent(uuid)
        return reply.code(204).send()
      } catch (error) {
        const err = error as { status?: number }
        if (err.status === 404) {
          return reply.code(404).send({ error: 'Agent not found' })
        }
        throw error
      }
    }
  )

  // POST /api/v1/agents/register - Register existing agent from OpenClaw (admin only)
  // This allows OpenClaw to register an agent with a pre-existing UUID
  fastify.post<{ Body: RegisterAgentBody }>(
    '/register',
    { preHandler: authenticateAdmin },
    async (
      request: FastifyRequest<{ Body: RegisterAgentBody }>,
      reply: FastifyReply
    ) => {
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
        const err = error as { status?: number; message?: string }
        if (err.status === 409) {
          return reply.code(409).send({ error: err.message })
        }
        throw error
      }
    }
  )
}
