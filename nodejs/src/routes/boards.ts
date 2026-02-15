import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import type { Task as PrismaTask } from '@prisma/client'

interface BoardJson {
  id: string
  name: string
  icon: string
  color: string
  position: number
  user_id: string
  agent_id: string | null
  organization_id: string
  organization_name: string
  owner_email: string | null
  created_at: string
  updated_at: string
}

interface TaskJson {
  id: string
  name: string | null
  description: string | null
  status: string
  priority: string
  position: number | null
  blocked: boolean
  assigned_to_agent: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

// Board with relations type
interface BoardWithRelations {
  id: bigint
  name: string
  icon: string
  color: string
  position: number
  userId: bigint
  agentId: bigint | null
  organizationId: bigint
  createdAt: Date
  updatedAt: Date
  organization: { id: bigint; name: string }
  user: { id: bigint; emailAddress: string } | null
  agent: { uuid: string } | null
}

// Helper function to create board JSON response
function boardToJson (board: BoardWithRelations): BoardJson {
  return {
    id: board.id.toString(),
    name: board.name,
    icon: board.icon,
    color: board.color,
    position: board.position,
    user_id: board.userId.toString(),
    agent_id: board.agent?.uuid ?? null,
    organization_id: board.organizationId.toString(),
    organization_name: board.organization.name,
    owner_email: board.user?.emailAddress ?? null,
    created_at: board.createdAt.toISOString(),
    updated_at: board.updatedAt.toISOString(),
  }
}

// Helper function to create task JSON response
function taskToJson (task: PrismaTask): TaskJson {
  return {
    id: task.id.toString(),
    name: task.name,
    description: task.description,
    status: task.status,
    priority: task.priority,
    position: task.position,
    blocked: task.blocked,
    assigned_to_agent: task.assignedToAgent,
    tags: task.tags || [],
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
  }
}

export async function boardsRoutes (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // Query interface for GET /boards
  interface BoardsQuery {
    organization_id?: string
  }

  // GET /api/v1/boards - List user's boards (or all boards for admin)
  fastify.get<{ Querystring: BoardsQuery }>('/', async (request: FastifyRequest<{ Querystring: BoardsQuery }>, reply) => {
    const isAdmin = request.user.admin
    const { organization_id } = request.query

    // Build where clause
    const where: {
      userId?: bigint
      organizationId?: bigint
    } = {}

    // Non-admin users only see their own boards
    if (!isAdmin) {
      where.userId = BigInt(request.user.id)
    }

    // Filter by organization if provided
    if (organization_id) {
      where.organizationId = BigInt(organization_id)
    }

    const boards = await prisma.board.findMany({
      where,
      orderBy: { position: 'asc' },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, emailAddress: true },
        },
        agent: {
          select: { uuid: true },
        },
      },
    })

    const boardsData = boards.map(boardToJson)

    return {
      success: true,
      data: boardsData,
    }
  })

  // GET /api/v1/boards/:id - Get single board
  fastify.get<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const board = await prisma.board.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id),
      },
      include: {
        tasks: {
          orderBy: { position: 'asc' },
        },
        organization: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, emailAddress: true },
        },
        agent: {
          select: { uuid: true },
        },
      },
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    return {
      success: true,
      data: {
        ...boardToJson(board),
        tasks: board.tasks.map(taskToJson),
      },
    }
  })

  // POST /api/v1/boards - Create board
  fastify.post('/', async (request, reply) => {
    const { name, icon, color, position } = request.body as {
      name?: string
      icon?: string
      color?: string
      position?: number
    }

    if (!name) {
      return reply.code(400).send({ error: 'name is required' })
    }

    // Get position (put at end)
    const lastBoard = await prisma.board.findFirst({
      where: {
        userId: BigInt(request.user.id),
        organizationId: BigInt(request.user.currentOrganizationId ?? 0),
      },
      orderBy: { position: 'desc' },
    })

    const board = await prisma.board.create({
      data: {
        name,
        icon,
        color,
        userId: BigInt(request.user.id),
        organizationId: BigInt(request.user.currentOrganizationId ?? 0),
        position: position ?? (lastBoard?.position ?? -1) + 1,
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, emailAddress: true },
        },
        agent: {
          select: { uuid: true },
        },
      },
    })

    return reply.code(201).send({
      success: true,
      data: boardToJson(board),
    })
  })

  // PATCH /api/v1/boards/:id - Update board
  fastify.patch<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { name, icon, color, position, agent_id: agentIdParam } = request.body as {
      name?: string
      icon?: string
      color?: string
      position?: number
      agent_id?: string | null
    }

    if (position !== undefined && position !== null) {
      return reply.code(400).send({ error: 'position must be null' })
    }

    const board = await prisma.board.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id),
      },
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (icon !== undefined) updateData.icon = icon
    if (color !== undefined) updateData.color = color
    if (position !== undefined) updateData.position = position

    // Handle agent_id update - accepts UUID string or null
    if (agentIdParam !== undefined) {
      if (agentIdParam === null) {
        // Unlink board from agent
        updateData.agentId = null
      } else {
        // Look up agent by UUID (must be active)
        const agent = await prisma.agent.findFirst({
          where: {
            uuid: agentIdParam,
            isActive: true,
          },
        })
        if (!agent) {
          return reply.code(400).send({ error: 'Agent not found' })
        }
        updateData.agentId = agent.id
      }
    }

    const updatedBoard = await prisma.board.update({
      where: { id: board.id },
      data: updateData,
      include: {
        organization: {
          select: { id: true, name: true },
        },
        user: {
          select: { id: true, emailAddress: true },
        },
        agent: {
          select: { uuid: true },
        },
      },
    })

    return {
      success: true,
      data: boardToJson(updatedBoard),
    }
  })

  // DELETE /api/v1/boards/:id - Delete board
  fastify.delete<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const board = await prisma.board.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id),
      },
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    await prisma.board.delete({
      where: { id: board.id },
    })

    return reply.code(204).send()
  })
}
