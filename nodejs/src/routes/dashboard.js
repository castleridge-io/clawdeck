import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'

// Helper functions for JSON serialization
function boardToJson (board) {
  return {
    id: board.id.toString(),
    name: board.name,
    description: board.description,
    color: board.color,
    user_id: board.userId?.toString(),
    created_at: board.createdAt.toISOString(),
    updated_at: board.updatedAt.toISOString(),
  }
}

function agentToJson (agent) {
  return {
    id: agent.id.toString(),
    name: agent.name,
    emoji: agent.emoji,
    description: agent.description,
    status: agent.status,
    capabilities: agent.capabilities || [],
    last_seen_at: agent.lastSeenAt?.toISOString() ?? null,
    user_id: agent.userId?.toString(),
    created_at: agent.createdAt.toISOString(),
    updated_at: agent.updatedAt.toISOString(),
  }
}

export async function dashboardRoutes (fastify, opts) {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/dashboard - Aggregated dashboard data
  fastify.get('/', async (request, reply) => {
    const userId = BigInt(request.user.id)

    const [boards, agents, tasks] = await Promise.all([
      prisma.board.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.agent.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      }),
      prisma.task.findMany({
        where: { userId, archived: false },
        select: {
          id: true,
          status: true,
          priority: true,
          boardId: true,
          name: true,
          assignedToAgent: true,
        },
      }),
    ])

    // Aggregate task counts by status
    const taskCounts = {
      total: tasks.length,
      inbox: tasks.filter(t => t.status === 'inbox').length,
      up_next: tasks.filter(t => t.status === 'up_next').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      in_review: tasks.filter(t => t.status === 'in_review').length,
      done: tasks.filter(t => t.status === 'done').length,
    }

    // Aggregate by priority
    const priorityCounts = {
      high: tasks.filter(t => t.priority === 'high').length,
      medium: tasks.filter(t => t.priority === 'medium').length,
      low: tasks.filter(t => t.priority === 'low').length,
      none: tasks.filter(t => t.priority === 'none').length,
    }

    // Tasks per board
    const tasksPerBoard = {}
    for (const task of tasks) {
      const boardId = task.boardId.toString()
      tasksPerBoard[boardId] = (tasksPerBoard[boardId] || 0) + 1
    }

    return {
      boards: boards.map(boardToJson),
      agents: agents.map(agentToJson),
      taskCounts,
      priorityCounts,
      tasksPerBoard,
      assignedCount: tasks.filter(t => t.assignedToAgent).length,
    }
  })
}
