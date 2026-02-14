import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import type { Agent } from '@prisma/client'

interface RegisterBody {
  uuid?: string
  name: string
  slug: string
  emoji?: string
  color?: string
  description?: string
}

interface AgentJson {
  id: string
  uuid: string
  name: string
  slug: string
  emoji: string
  color: string
  description: string | null
  is_active: boolean
  last_active_at: string | null
  position: number
  organization_id: string
  created_at: string
  updated_at: string
}

// Helper function to create agent JSON response
function agentToJson (agent: Agent): AgentJson {
  return {
    id: agent.id.toString(),
    uuid: agent.uuid,
    name: agent.name,
    slug: agent.slug,
    emoji: agent.emoji,
    color: agent.color,
    description: agent.description,
    is_active: agent.isActive,
    last_active_at: agent.lastActiveAt?.toISOString() ?? null,
    position: agent.position,
    organization_id: agent.organizationId.toString(),
    created_at: agent.createdAt.toISOString(),
    updated_at: agent.updatedAt.toISOString(),
  }
}

export async function agentsRoutes (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // Apply authentication to all routes except where noted
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/agents - List all agents (admin only)
  fastify.get('/', async (request, reply) => {
    if (!request.user.admin) {
      return reply.code(403).send({ error: 'Admin access required' })
    }

    const agents = await prisma.agent.findMany({
      orderBy: { position: 'asc' },
    })

    const agentsData = agents.map(agentToJson)

    return {
      success: true,
      data: agentsData,
    }
  })

  // GET /api/v1/agents/:uuid - Get single agent by UUID
  fastify.get<{ Params: { uuid: string } }>('/:uuid', async (request, reply) => {
    const agent = await prisma.agent.findFirst({
      where: {
        uuid: request.params.uuid,
        isActive: true,
      },
    })

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' })
    }

    return {
      success: true,
      data: agentToJson(agent),
    }
  })

  // POST /api/v1/agents - Create new agent (admin only)
  fastify.post<{ Body: RegisterBody }>('/', async (request, reply) => {
    if (!request.user.admin) {
      return reply.code(403).send({ error: 'Admin access required' })
    }

    const { name, slug, emoji = '🤖', color = 'gray', description } = request.body

    if (!name || !slug) {
      return reply.code(400).send({ error: 'Name and slug are required' })
    }

    // Check for duplicate slug
    const existing = await prisma.agent.findFirst({
      where: { slug },
    })

    if (existing) {
      return reply.code(409).send({ error: 'Agent with this slug already exists' })
    }

    if (!request.user.currentOrganizationId) {
      return reply.code(400).send({ error: 'User must belong to an organization' })
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        slug,
        emoji,
        color,
        description,
        organizationId: request.user.currentOrganizationId,
      },
    })

    return reply.code(201).send({
      success: true,
      data: agentToJson(agent),
    })
  })

  // POST /api/v1/agents/register - Register agent with pre-existing UUID (for OpenClaw integration)
  fastify.post<{ Body: RegisterBody }>('/register', async (request, reply) => {
    const { uuid, name, slug, emoji = '🤖', color = 'gray', description } = request.body

    if (!uuid || !name || !slug) {
      return reply.code(400).send({ error: 'UUID, name, and slug are required' })
    }

    // Check for duplicate UUID
    const existingByUuid = await prisma.agent.findFirst({
      where: { uuid },
    })

    if (existingByUuid) {
      return reply.code(409).send({ error: 'Agent with this UUID already exists' })
    }

    // Check for duplicate slug
    const existingBySlug = await prisma.agent.findFirst({
      where: { slug },
    })

    if (existingBySlug) {
      return reply.code(409).send({ error: 'Agent with this slug already exists' })
    }

    if (!request.user.currentOrganizationId) {
      return reply.code(400).send({ error: 'User must belong to an organization' })
    }

    const agent = await prisma.agent.create({
      data: {
        uuid,
        name,
        slug,
        emoji,
        color,
        description,
        organizationId: request.user.currentOrganizationId,
      },
    })

    return reply.code(201).send({
      success: true,
      data: agentToJson(agent),
    })
  })

  // PATCH /api/v1/agents/:uuid - Update agent (admin only)
  fastify.patch<{ Params: { uuid: string }; Body: Partial<RegisterBody> }>('/:uuid', async (request, reply) => {
    if (!request.user.admin) {
      return reply.code(403).send({ error: 'Admin access required' })
    }

    const agent = await prisma.agent.findFirst({
      where: {
        uuid: request.params.uuid,
        isActive: true,
      },
    })

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' })
    }

    const { name, slug, emoji, color, description } = request.body

    // Check for duplicate slug if changing
    if (slug && slug !== agent.slug) {
      const existing = await prisma.agent.findFirst({
        where: { slug },
      })

      if (existing) {
        return reply.code(409).send({ error: 'Agent with this slug already exists' })
      }
    }

    const updateData: {
      name?: string
      slug?: string
      emoji?: string
      color?: string
      description?: string | null
    } = {}

    if (name !== undefined) updateData.name = name
    if (slug !== undefined) updateData.slug = slug
    if (emoji !== undefined) updateData.emoji = emoji
    if (color !== undefined) updateData.color = color
    if (description !== undefined) updateData.description = description

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: updateData,
    })

    return {
      success: true,
      data: agentToJson(updated),
    }
  })

  // DELETE /api/v1/agents/:uuid - Soft delete agent (admin only)
  fastify.delete<{ Params: { uuid: string } }>('/:uuid', async (request, reply) => {
    if (!request.user.admin) {
      return reply.code(403).send({ error: 'Admin access required' })
    }

    const agent = await prisma.agent.findFirst({
      where: {
        uuid: request.params.uuid,
        isActive: true,
      },
    })

    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' })
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { isActive: false },
    })

    return reply.code(204).send()
  })
}
