import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import type { Board, Task as PrismaTask } from '@prisma/client'

interface BoardJson {
  id: string
  name: string
  icon: string
  color: string
  position: number
  user_id: string
  agent_id: string | null
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

// Helper function to create board JSON response
async function boardToJson (board: Board): Promise<BoardJson> {
  // Get agent UUID if board is linked to an agent
  let agentUuid: string | null = null
  if (board.agentId) {
    const agent = await prisma.agent.findUnique({
      where: { id: board.agentId },
      select: { uuid: true },
    })
    agentUuid = agent?.uuid ?? null
  }

  return {
    id: board.id.toString(),
    name: board.name,
    icon: board.icon,
    color: board.color,
    position: board.position,
    user_id: board.userId.toString(),
    agent_id: agentUuid,
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

  // GET /api/v1/boards - List user's boards
  fastify.get('/', async (request, reply) => {
    const boards = await prisma.board.findMany({
      where: { userId: BigInt(request.user.id) },
      orderBy: { position: 'asc' },
    })

    const boardsData = await Promise.all(boards.map(boardToJson))

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
      },
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    return {
      success: true,
      data: {
        ...(await boardToJson(board)),
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
      where: { userId: BigInt(request.user.id) },
      orderBy: { position: 'desc' },
    })

    const board = await prisma.board.create({
      data: {
        name,
        icon,
        color,
        userId: BigInt(request.user.id),
        position: position ?? (lastBoard?.position ?? -1) + 1,
      },
    })

    return reply.code(201).send({
      success: true,
      data: await boardToJson(board),
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
    })

    return {
      success: true,
      data: await boardToJson(updatedBoard),
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
