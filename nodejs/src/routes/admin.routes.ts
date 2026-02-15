import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { createAuthService } from '../services/auth.service.js'
import { createAdminService } from '../services/admin.service.js'

export async function adminRoutes (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const authService = createAuthService(fastify)
  const adminService = createAdminService()

  fastify.get(
    '/stats',
    {
      onRequest: [fastify.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const stats = await authService.getUserStats()

        return reply.send(stats)
      } catch (error) {
        return reply.code(500).send({ error: 'Failed to fetch stats' })
      }
    }
  )

  fastify.get(
    '/users',
    {
      onRequest: [fastify.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const query = request.query as { page?: string; limit?: string }
        const page = parseInt(query.page || '1')
        const limit = parseInt(query.limit || '50')

        const result = await authService.getAllUsers(page, limit)

        return reply.send(result)
      } catch (error) {
        return reply.code(500).send({ error: 'Failed to fetch users' })
      }
    }
  )

  fastify.delete(
    '/users/:userId',
    {
      onRequest: [fastify.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const { prisma } = await import('../db/prisma.js')

        const params = request.params as { userId: string }
        const user = await prisma.user.findUnique({
          where: { id: BigInt(params.userId) },
        })

        if (!user) {
          return reply.code(404).send({ error: 'User not found' })
        }

        if (user.id.toString() === request.user.id.toString()) {
          return reply.code(400).send({ error: 'Cannot delete yourself' })
        }

        await prisma.user.delete({
          where: { id: BigInt(params.userId) },
        })

        return reply.send({ message: 'User deleted successfully' })
      } catch (error) {
        return reply.code(500).send({ error: 'Failed to delete user' })
      }
    }
  )

  fastify.patch(
    '/users/:userId/admin',
    {
      onRequest: [fastify.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const { prisma } = await import('../db/prisma.js')

        const { admin } = request.body as { admin?: boolean }

        if (typeof admin !== 'boolean') {
          return reply.code(400).send({ error: 'admin must be a boolean' })
        }

        const params = request.params as { userId: string }
        const user = await prisma.user.findUnique({
          where: { id: BigInt(params.userId) },
        })

        if (!user) {
          return reply.code(404).send({ error: 'User not found' })
        }

        const updatedUser = await prisma.user.update({
          where: { id: BigInt(params.userId) },
          data: { admin },
        })

        return reply.send({
          id: updatedUser.id.toString(),
          emailAddress: updatedUser.emailAddress,
          admin: updatedUser.admin,
        })
      } catch (error) {
        return reply.code(500).send({ error: 'Failed to update user' })
      }
    }
  )

  // GET /api/v1/admin/boards - List all boards with owner info
  fastify.get(
    '/boards',
    {
      onRequest: [fastify.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const query = request.query as { page?: string; limit?: string }
        const page = parseInt(query.page || '1')
        const limit = parseInt(query.limit || '50')

        const result = await adminService.listAllBoards(page, limit)

        return reply.send({ success: true, ...result })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({ error: 'Failed to fetch boards' })
      }
    }
  )

  // GET /api/v1/admin/tasks - List all tasks with owner and board info
  fastify.get(
    '/tasks',
    {
      onRequest: [fastify.authenticateAdmin],
    },
    async (request, reply) => {
      try {
        const query = request.query as { user_id?: string; status?: string; page?: string; limit?: string }
        const filters = {
          user_id: query.user_id,
          status: query.status,
        }
        const page = parseInt(query.page || '1')
        const limit = parseInt(query.limit || '50')

        const result = await adminService.listAllTasks(filters, page, limit)

        return reply.send({ success: true, ...result })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({ error: 'Failed to fetch tasks' })
      }
    }
  )
}
