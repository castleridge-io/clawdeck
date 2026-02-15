export function createAdminService () {
  return {
    /**
     * List all boards with owner info
     * @param {number} page - Page number (1-indexed)
     * @param {number} limit - Items per page
     * @returns {Promise<{data: Array, meta: {total: number, page: number, pages: number}}>}
     */
    async listAllBoards (
      page = 1,
      limit = 50
    ): Promise<{ data: Array<unknown>; meta: { total: number; page: number; pages: number } }> {
      const prisma = (await import('../db/prisma.js')).prisma

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
          task_count: (board as { _count?: { tasks?: number } })._count?.tasks ?? 0,
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
     * @param {number} page - Page number (1-indexed)
     * @param {number} limit - Items per page
     * @returns {Promise<{data: Array, meta: {total: number; page: number; pages: number}}>}
     */
    async listAllTasks (
      filters: {
        user_id?: string
        status?: string
      } = {},
      page = 1,
      limit = 50
    ): Promise<{ data: Array<unknown>; meta: { total: number; page: number; pages: number } }> {
      const prisma = (await import('../db/prisma.js')).prisma

      const skip = (page - 1) * limit

      const where: Record<string, unknown> = {}
      if (filters.user_id) {
        where.userId = BigInt(filters.user_id)
      }
      if (filters.status) {
        where.status = filters.status
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
          owner: {
            id: task.user?.id?.toString() ?? 'unknown',
            emailAddress: task.user?.emailAddress ?? 'unknown',
            agentName: task.user?.agentName ?? null,
          },
          board: {
            id: task.board.id.toString(),
            name: task.board.name,
          },
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
