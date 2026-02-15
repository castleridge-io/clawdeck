import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import type { Task } from '@prisma/client'

interface TaskJson {
  id: string
  name: string | null
  description: string | null
  status: string
  priority: string
  position: number | null
  board_id: string
  user_id: string | null
  completed: boolean
  completed_at: string | null
  archived: boolean
  archived_at: string | null
  due_date: string | null
  tags: string[]
  blocked: boolean
  assigned_to_agent: boolean
  assigned_at: string | null
  agent_claimed_at: string | null
  created_at: string
  updated_at: string
}

// Helper function to create task JSON response
function taskToJson (task: Task): TaskJson {
  return {
    id: task.id.toString(),
    name: task.name,
    description: task.description,
    status: task.status,
    priority: task.priority,
    position: task.position,
    board_id: task.boardId.toString(),
    user_id: task.userId?.toString() ?? null,
    completed: task.completed,
    completed_at: task.completedAt?.toISOString() ?? null,
    archived: task.archived,
    archived_at: task.archivedAt?.toISOString() ?? null,
    due_date: task.dueDate?.toISOString() ?? null,
    tags: task.tags || [],
    blocked: task.blocked,
    assigned_to_agent: task.assignedToAgent,
    assigned_at: task.assignedAt?.toISOString() ?? null,
    agent_claimed_at: task.agentClaimedAt?.toISOString() ?? null,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
  }
}

// Helper function to record task activity
async function recordActivity (
  task: Task,
  user: { id: bigint; agentName?: string | null; agentEmoji?: string | null },
  action: string,
  activityData: {
    actorType?: string
    actorName?: string
    actorEmoji?: string
    fieldName?: string
    oldValue?: string
    newValue?: string
    note?: string
    source?: string
  } = {}
): Promise<void> {
  await prisma.taskActivity.create({
    data: {
      taskId: BigInt(task.id),
      userId: user?.id ? BigInt(user.id) : null,
      action,
      actorType: activityData.actorType || 'agent',
      actorName: activityData.actorName,
      actorEmoji: activityData.actorEmoji,
      fieldName: activityData.fieldName,
      oldValue: activityData.oldValue,
      newValue: activityData.newValue,
      note: activityData.note,
      source: activityData.source || 'api',
    },
  })
}

export async function archivesRoutes (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/archives - List archived tasks with filters
  fastify.get<{ Querystring: { board_id?: string; page?: string; limit?: string } }>('/', async (request: FastifyRequest<{ Querystring: { board_id?: string; page?: string; limit?: string } }>, reply: FastifyReply) => {
    const { board_id, page = '1', limit = '50' } = request.query

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const where: Record<string, unknown> = {
      userId: BigInt(request.user.id),
      archived: true,
    }

    if (board_id) {
      where.boardId = BigInt(board_id)
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: { archivedAt: 'desc' },
      }),
      prisma.task.count({ where }),
    ])

    return reply.send({
      data: tasks.map(taskToJson),
      meta: { total, page: parseInt(page), limit: parseInt(limit) },
    })
  })

  // POST /api/v1/archives/:id/unarchive - Unarchive a task
  fastify.post<{ Params: { id: string } }>('/:id/unarchive', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(id),
        userId: BigInt(request.user.id),
      },
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        archived: false,
        archivedAt: null,
      },
    })

    await recordActivity(task, request.user, 'unarchived', {
      actorType: 'user',
      actorName: request.user.agentName || undefined,
      actorEmoji: request.user.agentEmoji || undefined,
    })

    return reply.send(taskToJson(updatedTask))
  })

  // DELETE /api/v1/archives/:id - Permanently delete an archived task
  fastify.delete<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(id),
        userId: BigInt(request.user.id),
      },
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    if (!task.archived) {
      return reply.code(400).send({ error: 'Only archived tasks can be permanently deleted' })
    }

    await prisma.task.delete({
      where: { id: task.id },
    })

    return reply.code(204).send()
  })
}
