import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { wsManager } from '../websocket/manager.js'
import { archiveScheduler } from '../services/archiveScheduler.js'

// Helper function to create task JSON response
function taskToJson(task) {
  return {
    id: task.id.toString(),
    name: task.name,
    description: task.description,
    status: task.status,
    priority: task.priority,
    position: task.position,
    board_id: task.boardId.toString(),
    user_id: task.userId?.toString(),
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
    updated_at: task.updatedAt.toISOString()
  }
}

// Helper function to record task activity
async function recordActivity(task, user, action, activityData = {}) {
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
      source: activityData.source || 'api'
    }
  })
}

export async function archivesRoutes(fastify, opts) {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/archives - List archived tasks with filters
  fastify.get('/', async (request, reply) => {
    const { board_id, page = 1, limit = 50 } = request.query

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const take = parseInt(limit)

    const where = {
      userId: BigInt(request.user.id),
      archived: true
    }

    if (board_id) {
      where.boardId = BigInt(board_id)
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take,
        orderBy: [
          { archivedAt: 'desc' },
          { completedAt: 'desc' }
        ]
      }),
      prisma.task.count({ where })
    ])

    return {
      success: true,
      data: tasks.map(taskToJson),
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        pages: Math.ceil(total / take)
      }
    }
  })

  // PATCH /api/v1/archives/:id/unarchive - Restore task from archive
  fastify.patch('/:id/unarchive', async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
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
        archivedAt: null
      }
    })

    // Record activity
    await recordActivity(updatedTask, request.user, 'unarchived', {
      actorName: request.agentName,
      actorEmoji: request.agentEmoji,
      fieldName: 'archived',
      oldValue: 'true',
      newValue: 'false',
      source: 'api'
    })

    // Broadcast task unarchived
    wsManager.broadcastTaskEvent(request.user.id, 'task_unarchived', taskToJson(updatedTask))

    return taskToJson(updatedTask)
  })

  // DELETE /api/v1/archives/:id - Permanently delete archived task
  fastify.delete('/:id', async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    if (!task.archived) {
      return reply.code(400).send({ error: 'Only archived tasks can be permanently deleted' })
    }

    const taskData = taskToJson(task)

    await prisma.task.delete({
      where: { id: task.id }
    })

    // Broadcast task deletion
    wsManager.broadcastTaskEvent(request.user.id, 'task_deleted', {
      id: taskData.id,
      board_id: taskData.board_id
    })

    return reply.code(204).send()
  })

  // PATCH /api/v1/archives/:id/schedule - Schedule immediate archive (override delay)
  fastify.patch('/:id/schedule', async (request, reply) => {
    try {
      const task = await archiveScheduler.scheduleImmediateArchive(request.params.id)
      return {
        success: true,
        data: task
      }
    } catch (error) {
      if (error.message === 'Task not found') {
        return reply.code(404).send({ error: 'Task not found' })
      }
      if (error.message === 'Only completed tasks can be archived') {
        return reply.code(400).send({ error: error.message })
      }
      if (error.message === 'Task is already archived') {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })
}
