import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { wsManager } from '../websocket/manager.js'
import { createWorkflowService } from '../services/workflow.service.js'
import { createRunService } from '../services/run.service.js'

// Initialize services
const workflowService = createWorkflowService()
const runService = createRunService()

// Helper function to create task JSON response
function taskToJson (task) {
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
    workflow_type: task.workflowType,
    workflow_run_id: task.workflowRunId,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString()
  }
}

// Helper function to record task activity
async function recordActivity (task, user, action, activityData = {}) {
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

export async function tasksRoutes (fastify, opts) {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/tasks - List tasks with filters
  fastify.get('/', async (request, reply) => {
    const { assigned, status, board_id, archived } = request.query

    const where = { userId: BigInt(request.user.id) }

    if (assigned === 'true') {
      where.assignedToAgent = true
    }

    if (status && ['inbox', 'up_next', 'in_progress', 'in_review', 'done'].includes(status)) {
      where.status = status
    }

    if (board_id) {
      where.boardId = BigInt(board_id)
    }

    // By default, exclude archived tasks unless explicitly requested
    if (archived === 'true') {
      where.archived = true
    } else if (archived === 'false' || archived === undefined) {
      where.archived = false
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [
        { assignedAt: 'asc' },
        { position: 'asc' }
      ]
    })

    return {
      success: true,
      data: tasks.map(taskToJson)
    }
  })

  // GET /api/v1/tasks/next - Get next task for agent (auto-mode)
  fastify.get('/next', async (request, reply) => {
    // Check if user has agent auto mode enabled
    if (!request.user.agentAutoMode) {
      return reply.code(204).send()
    }

    const task = await prisma.task.findFirst({
      where: {
        userId: BigInt(request.user.id),
        status: 'up_next',
        blocked: false,
        agentClaimedAt: null
      },
      orderBy: [
        { priority: 'desc' },
        { position: 'asc' }
      ]
    })

    if (!task) {
      return reply.code(204).send()
    }

    return taskToJson(task)
  })

  // GET /api/v1/tasks/pending_attention - Tasks needing agent attention
  fastify.get('/pending_attention', async (request, reply) => {
    if (!request.user.agentAutoMode) {
      return []
    }

    const tasks = await prisma.task.findMany({
      where: {
        userId: BigInt(request.user.id),
        status: 'in_progress',
        agentClaimedAt: { not: null }
      }
    })

    return tasks.map(taskToJson)
  })

  // GET /api/v1/tasks/:id - Get single task
  fastify.get('/:id', async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    return taskToJson(task)
  })

  // POST /api/v1/tasks - Create task
  fastify.post('/', async (request, reply) => {
    const { name, description, board_id, status = 'inbox', priority = 'none', tags = [], workflow_type } = request.body

    if (!board_id) {
      return reply.code(400).send({ error: 'board_id is required' })
    }

    // Verify board belongs to user
    const board = await prisma.board.findFirst({
      where: {
        id: BigInt(board_id),
        userId: BigInt(request.user.id)
      }
    })

    if (!board) {
      return reply.code(404).send({ error: 'Board not found' })
    }

    // If workflow_type is provided, verify workflow exists
    let workflow
    if (workflow_type) {
      workflow = await workflowService.getWorkflowByName(workflow_type)
      if (!workflow) {
        return reply.code(400).send({ error: 'Workflow not found' })
      }
    }

    // Get position (put at end)
    const lastTask = await prisma.task.findFirst({
      where: { boardId: BigInt(board_id) },
      orderBy: { position: 'desc' }
    })

    const taskData = {
      name,
      description,
      boardId: BigInt(board_id),
      userId: BigInt(request.user.id),
      status: status || 'inbox',
      priority: priority || 'none',
      tags,
      position: (lastTask?.position ?? -1) + 1
    }

    // Add workflow fields if provided
    if (workflow_type && workflow) {
      taskData.workflowType = workflow_type
    }

    const task = await prisma.task.create({
      data: taskData
    })

    // Auto-create Run if workflow_type was provided
    if (workflow_type && workflow) {
      const run = await runService.createRun({
        workflowId: workflow.id,
        taskId: task.id.toString(),
        task: task.name || description || 'Task',
        context: { taskId: task.id.toString() }
      })

      // Link task to run
      await prisma.task.update({
        where: { id: task.id },
        data: { workflowRunId: run.id }
      })

      task.workflowRunId = run.id
    }

    // Record activity
    await recordActivity(task, request.user, 'create', {
      actorName: request.agentName,
      actorEmoji: request.agentEmoji,
      source: 'api'
    })

    // Broadcast task creation
    wsManager.broadcastTaskEvent(request.user.id, 'task_created', taskToJson(task))

    return reply.code(201).send(taskToJson(task))
  })

  // PATCH /api/v1/tasks/:id - Update task
  fastify.patch('/:id', async (request, reply) => {
    const { status, priority, name, description, activity_note } = request.body

    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    const updateData = {}
    const activityData = {
      actorName: request.agentName,
      actorEmoji: request.agentEmoji,
      source: 'api'
    }

    if (status && ['inbox', 'up_next', 'in_progress', 'in_review', 'done'].includes(status)) {
      if (status !== task.status) {
        updateData.status = status
        activityData.fieldName = 'status'
        activityData.oldValue = task.status
        activityData.newValue = status

        // Auto-set completed_at when moving to done
        if (status === 'done' && !task.completed) {
          updateData.completed = true
          updateData.completedAt = new Date()
        }
      }
    }

    if (priority && ['none', 'low', 'medium', 'high'].includes(priority)) {
      if (priority !== task.priority) {
        updateData.priority = priority
        activityData.fieldName = 'priority'
        activityData.oldValue = task.priority
        activityData.newValue = priority
      }
    }

    if (name !== undefined) {
      updateData.name = name
      activityData.fieldName = 'name'
      activityData.oldValue = task.name
      activityData.newValue = name
    }

    if (description !== undefined) {
      updateData.description = description
      activityData.fieldName = 'description'
      activityData.oldValue = task.description
      activityData.newValue = description
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: updateData
    })

    // Record activity
    await recordActivity(updatedTask, request.user, 'update', activityData)

    // Add activity note if provided
    if (activity_note) {
      await recordActivity(updatedTask, request.user, 'note', {
        note: activity_note,
        actorName: request.agentName,
        actorEmoji: request.agentEmoji,
        source: 'api'
      })
    }

    // Broadcast task update
    wsManager.broadcastTaskEvent(request.user.id, 'task_updated', taskToJson(updatedTask))

    return taskToJson(updatedTask)
  })

  // PATCH /api/v1/tasks/:id/claim - Agent claims a task
  fastify.patch('/:id/claim', async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        agentClaimedAt: new Date(),
        status: 'in_progress'
      }
    })

    // Record activity
    await recordActivity(updatedTask, request.user, 'claim', {
      actorName: request.agentName,
      actorEmoji: request.agentEmoji,
      fieldName: 'status',
      oldValue: task.status,
      newValue: 'in_progress',
      source: 'api'
    })

    // Broadcast task claim
    wsManager.broadcastTaskEvent(request.user.id, 'task_claimed', taskToJson(updatedTask))

    return taskToJson(updatedTask)
  })

  // PATCH /api/v1/tasks/:id/unclaim - Agent unclaims a task
  fastify.patch('/:id/unclaim', async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        agentClaimedAt: null
      }
    })

    // Record activity
    await recordActivity(updatedTask, request.user, 'unclaim', {
      actorName: request.agentName,
      actorEmoji: request.agentEmoji,
      source: 'api'
    })

    // Broadcast task unclaim
    wsManager.broadcastTaskEvent(request.user.id, 'task_unclaimed', taskToJson(updatedTask))

    return taskToJson(updatedTask)
  })

  // PATCH /api/v1/tasks/:id/assign - Assign task to agent
  fastify.patch('/:id/assign', async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        assignedToAgent: true,
        assignedAt: new Date()
      }
    })

    // Record activity
    await recordActivity(updatedTask, request.user, 'assign', {
      actorName: request.agentName,
      actorEmoji: request.agentEmoji,
      fieldName: 'assigned_to_agent',
      oldValue: String(task.assignedToAgent),
      newValue: 'true',
      source: 'api'
    })

    // Broadcast task assignment
    wsManager.broadcastTaskEvent(request.user.id, 'task_assigned', taskToJson(updatedTask))

    return taskToJson(updatedTask)
  })

  // PATCH /api/v1/tasks/:id/unassign - Unassign task from agent
  fastify.patch('/:id/unassign', async (request, reply) => {
    const task = await prisma.task.findFirst({
      where: {
        id: BigInt(request.params.id),
        userId: BigInt(request.user.id)
      }
    })

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' })
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        assignedToAgent: false,
        assignedAt: null
      }
    })

    // Record activity
    await recordActivity(updatedTask, request.user, 'unassign', {
      actorName: request.agentName,
      actorEmoji: request.agentEmoji,
      fieldName: 'assigned_to_agent',
      oldValue: 'true',
      newValue: 'false',
      source: 'api'
    })

    // Broadcast task unassignment
    wsManager.broadcastTaskEvent(request.user.id, 'task_unassigned', taskToJson(updatedTask))

    return taskToJson(updatedTask)
  })

  // DELETE /api/v1/tasks/:id - Delete task
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

    const taskData = taskToJson(task)

    await prisma.task.delete({
      where: { id: task.id }
    })

    // Broadcast task deletion
    wsManager.broadcastTaskEvent(request.user.id, 'task_deleted', { id: taskData.id, board_id: taskData.board_id })

    return reply.code(204).send()
  })
}
