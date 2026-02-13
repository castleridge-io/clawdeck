import { prisma } from '../db/prisma.js'

export function createAdminService () {
  return {
    /**
     * List all boards with owner info
     * @param {number} page - Page number (1-indexed)
     * @param {number} limit - Items per page
     * @returns {Promise<{data: Array, meta: {total: number, page: number, pages: number}}>}
     */
    async listAllBoards (page = 1, limit = 50) {
      const skip = (page - 1) * limit

      const [boards, total] = await Promise.all([
        prisma.board.findMany({
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                emailAddress: true,
                agentName: true,
              },
            },
            _count: {
              select: { tasks: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.board.count(),
      ])

      return {
        data: boards.map((board) => ({
          id: board.id.toString(),
          name: board.name,
          icon: board.icon,
          color: board.color,
          owner: {
            id: board.user.id.toString(),
            emailAddress: board.user.emailAddress,
            agentName: board.user.agentName,
          },
          task_count: board._count.tasks,
          created_at: board.createdAt.toISOString(),
        })),
        meta: {
          total,
          page,
          pages: Math.ceil(total / limit),
        },
      }
    },

    /**
     * List all tasks with owner and board info
     * @param {Object} filters - Filter options
     * @param {string} [filters.user_id] - Filter by user ID
     * @param {string} [filters.status] - Filter by task status
     * @param {number} page - Page number (1-indexed)
     * @param {number} limit - Items per page
     * @returns {Promise<{data: Array, meta: {total: number, page: number, pages: number}}>}
     */
    async listAllTasks (filters = {}, page = 1, limit = 50) {
      const { user_id, status } = filters
      const skip = (page - 1) * limit

      const where = {}
      if (user_id) {
        where.userId = BigInt(user_id)
      }
      if (status) {
        where.status = status
      }

      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          skip,
          take: limit,
          include: {
            user: {
              select: {
                id: true,
                emailAddress: true,
                agentName: true,
              },
            },
            board: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.task.count({ where }),
      ])

      return {
        data: tasks.map((task) => ({
          id: task.id.toString(),
          name: task.name,
          status: task.status,
          priority: task.priority,
          owner: task.user
            ? {
                id: task.user.id.toString(),
                emailAddress: task.user.emailAddress,
                agentName: task.user.agentName,
              }
            : null,
          board: task.board
            ? {
                id: task.board.id.toString(),
                name: task.board.name,
              }
            : null,
          created_at: task.createdAt.toISOString(),
        })),
        meta: {
          total,
          page,
          pages: Math.ceil(total / limit),
        },
      }
    },
  }
}
