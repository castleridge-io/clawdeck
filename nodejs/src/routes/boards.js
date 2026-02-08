import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'

function boardToJson (board) {
  return {
    id: board.id.toString(),
    name: board.name,
    icon: board.icon,
    color: board.color,
    position: board.position,
    user_id: board.userId.toString(),
    created_at: board.createdAt.toISOString(),
    updated_at: board.updatedAt.toISOString()
  }
}

export async function boardsRoutes (fastify, opts) {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/boards - List user's boards
  fastify.get('/', async (request) => {
    const boards = await prisma.board.findMany({
      where: { userId: BigInt(request.user.id) },
      orderBy: { position: 'asc' }
    })

    return {
      success: true,
      data: boards.map(boardToJson)
    }
  })

  // GET /api/v1/boards/:id - Get single board
  fastify.get('/:id', async (request, reply) => {
    const board = await prisma.board.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      },
      include: {
        tasks: {
          orderBy: { position: 'asc' }
        }
      }
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    return {
      success: true,
      data: {
        ...boardToJson(board),
        tasks: board.tasks.map(task => ({
          id: task.id.toString(),
          name: task.name,
          description: task.description,
          status: ['inbox', 'up_next', 'in_progress', 'in_review', 'done'][task.status],
          priority: ['none', 'low', 'medium', 'high'][task.priority],
          position: task.position,
          blocked: task.blocked,
          assigned_to_agent: task.assignedToAgent,
          tags: task.tags || [],
          created_at: task.createdAt.toISOString(),
          updated_at: task.updatedAt.toISOString()
        }))
      }
    }
  })

  // POST /api/v1/boards - Create board
  fastify.post('/', async (request, reply) => {
    const { name, icon, color, position } = request.body

    if (!name) {
      return reply.code(400).send({ error: 'name is required' })
    }

    // Get position (put at end)
    const lastBoard = await prisma.board.findFirst({
      where: { userId: BigInt(request.user.id) },
      orderBy: { position: 'desc' }
    })

    const board = await prisma.board.create({
      data: {
        name,
        icon,
        color,
        userId: BigInt(request.user.id),
        position: position ?? ((lastBoard?.position ?? -1) + 1)
      }
    })

    return reply.code(201).send({
      success: true,
      data: boardToJson(board)
    })
  })

  // PATCH /api/v1/boards/:id - Update board
  fastify.patch('/:id', async (request, reply) => {
    const { name, icon, color, position } = request.body

    const board = await prisma.board.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (icon !== undefined) updateData.icon = icon
    if (color !== undefined) updateData.color = color
    if (position !== undefined) updateData.position = position

    const updatedBoard = await prisma.board.update({
      where: { id: board.id },
      data: updateData
    })

    return {
      success: true,
      data: boardToJson(updatedBoard)
    }
  })

  // DELETE /api/v1/boards/:id - Delete board
  fastify.delete('/:id', async (request, reply) => {
    const board = await prisma.board.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    await prisma.board.delete({
      where: { id: board.id }
    })

    return reply.code(204).send()
  })
}
