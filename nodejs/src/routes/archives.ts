import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import type { Task } from '@prisma/client'

// Helper to safely parse JSON (prevents crashes from invalid JSON in DB)
function safeJsonParse(str: string | null): unknown | null {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return str // Return as-is if not valid JSON
  }
}

// Helper function to create task JSON response
function taskToJson(task: Task): TaskJson {
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
async function recordActivity(
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

export async function archivesRoutes(
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
        orderBy: [{ archivedAt: 'desc' }, { completedAt: 'desc' }],
      }),
      prisma.task.count({ where }),
    ])

    return {
      success: true,
      data: tasks.map(taskToJson),
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        pages: Math.ceil(total / take),
      },
    }
  })

  // PATCH /api/v1/archives/:id/unarchive - Restore task from archive
  fastify.patch<{ Params: { id: string } }>('/:id/unarchive', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id),
      },
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    if (!task.archived) {
      return reply.code(400).send({ error: 'Task is not archived' })
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        archived: false,
        archivedAt: null,
      },
    })

    // Record activity
    await recordActivity(updatedTask, { id: request.user.id }, 'unarchived', {
      actorName: request.agentName ?? undefined,
      actorEmoji: request.agentEmoji ?? undefined,
      fieldName: 'archived',
      oldValue: 'true',
      newValue: 'false',
      source: 'api',
    })

    return taskToJson(updatedTask)
  })

  // DELETE /api/v1/archives/:id - Permanently delete archived task
  fastify.delete<{ Params: { id: string } }>('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id),
      },
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    if (!task.archived) {
      return reply.code(400).send({ error: 'Only archived tasks can be permanently deleted' })
    }

    const taskData = taskToJson(task)

    await prisma.task.delete({
      where: { id: task.id },
    })

    return reply.code(204).send()
  })
}
