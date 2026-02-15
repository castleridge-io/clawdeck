import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'

export async function organizationsRoutes (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/organizations - List organizations
  // Admins see all organizations, regular users see their own organizations
  fastify.get('/', async (request: FastifyRequest, reply) => {
    const isAdmin = request.user.admin

    if (isAdmin) {
      // Admins see all organizations
      const organizations = await prisma.organization.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      })

      return {
        success: true,
        data: organizations.map((org) => ({
          id: org.id.toString(),
          name: org.name,
          slug: org.slug,
        })),
      }
    } else {
      // Regular users see organizations they're members of
      const memberships = await prisma.membership.findMany({
        where: { userId: BigInt(request.user.id) },
        include: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      })

      return {
        success: true,
        data: memberships.map((m) => ({
          id: m.organization.id.toString(),
          name: m.organization.name,
          slug: m.organization.slug,
        })),
      }
    }
  })
}
