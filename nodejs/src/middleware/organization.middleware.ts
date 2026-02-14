import { z } from 'zod'
import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../db/prisma.js'
import type { MembershipRole, User } from '@prisma/client'

// Zod Schemas
export const MembershipRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer'])

export type Role = z.infer<typeof MembershipRoleSchema>

// Role hierarchy for permission checks
const roleHierarchy: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1
}

function hasRoleLevel (userRole: Role, requiredRole: Role): boolean {
  return (roleHierarchy[userRole] ?? 0) >= (roleHierarchy[requiredRole] ?? 0)
}

export interface OrganizationContext {
  organizationId: string
  role: MembershipRole
  organization: {
    id: string
    name: string
    slug: string
    avatarUrl: string | null
    plan: string
  }
}

// Augment FastifyRequest type
declare module 'fastify' {
  interface FastifyRequest {
    organization?: OrganizationContext
  }
}

export interface OrganizationMiddleware {
  getOrganizationContext (userId: string | bigint): Promise<OrganizationContext | null>
  requireOrganization (request: FastifyRequest, reply: FastifyReply): Promise<boolean>
  requireRole (allowedRoles: Role[]): (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>
  switchOrganization (userId: string | bigint, organizationId: string | bigint): Promise<{ success: boolean; organization: { id: string; name: string; slug: string }; role: string }>
  createOrganizationScopedQuery<T extends Record<string, unknown>> (request: FastifyRequest, baseQuery?: T): T & { organizationId: string }
  canPerformAction (request: FastifyRequest, resourceType: string, action: 'read' | 'write' | 'delete', resource: { organizationId?: string; userId?: string }): boolean
}

function toBigInt (value: string | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value)
}

export function createOrganizationMiddleware (): OrganizationMiddleware {
  return {
    async getOrganizationContext (userId) {
      const user = await prisma.user.findUnique({
        where: { id: toBigInt(userId) },
        select: { currentOrganizationId: true }
      })

      if (!user || !user.currentOrganizationId) {
        return null
      }

      // Get membership with organization
      const membership = await prisma.membership.findFirst({
        where: {
          userId: toBigInt(userId),
          organizationId: user.currentOrganizationId
        },
        include: {
          organization: true
        }
      })

      if (!membership) {
        // User's current org is set but they're not a member (data inconsistency)
        // Clear the current org
        await prisma.user.update({
          where: { id: toBigInt(userId) },
          data: { currentOrganizationId: null }
        })
        return null
      }

      return {
        organizationId: membership.organizationId.toString(),
        role: membership.role,
        organization: {
          id: membership.organization.id.toString(),
          name: membership.organization.name,
          slug: membership.organization.slug,
          avatarUrl: membership.organization.avatarUrl,
          plan: membership.organization.plan
        }
      }
    },

    async requireOrganization (request, reply) {
      const user = request.user as User | undefined
      if (!user || !user.id) {
        reply.code(401).send({ error: 'Authentication required' })
        return false
      }

      const context = await this.getOrganizationContext(user.id.toString())

      if (!context) {
        reply.code(403).send({
          error: 'Organization required',
          message: 'You must be a member of an organization to access this resource'
        })
        return false
      }

      // Attach to request
      request.organization = context

      return true
    },

    requireRole (allowedRoles) {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.organization) {
          // First get organization context
          const passed = await this.requireOrganization(request, reply)
          if (!passed) return false
        }

        const userRole = request.organization!.role

        // Check if user has any of the allowed roles
        const hasRole = allowedRoles.some((role) => {
          // If role is in hierarchy, check level
          if (role in roleHierarchy) {
            return hasRoleLevel(userRole, role)
          }
          // Otherwise exact match
          return userRole === role
        })

        if (!hasRole) {
          reply.code(403).send({
            error: 'Insufficient permissions',
            message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
          })
          return false
        }

        return true
      }
    },

    async switchOrganization (userId, organizationId) {
      // Check if user is a member of the target organization
      const membership = await prisma.membership.findFirst({
        where: {
          userId: toBigInt(userId),
          organizationId: toBigInt(organizationId)
        },
        include: {
          organization: true
        }
      })

      if (!membership) {
        throw new Error('Not a member of this organization')
      }

      // Update user's current organization
      await prisma.user.update({
        where: { id: toBigInt(userId) },
        data: { currentOrganizationId: toBigInt(organizationId) }
      })

      return {
        success: true,
        organization: {
          id: membership.organization.id.toString(),
          name: membership.organization.name,
          slug: membership.organization.slug
        },
        role: membership.role
      }
    },

    createOrganizationScopedQuery<T extends Record<string, unknown>> (request: FastifyRequest, baseQuery: T = {} as T): T & { organizationId: string } {
      if (!request.organization || !request.organization.organizationId) {
        throw new Error('No organization context available')
      }

      return {
        ...baseQuery,
        organizationId: request.organization.organizationId
      }
    },

    canPerformAction (request, resourceType, action, resource) {
      if (!request.organization) return false

      const role = request.organization.role
      const isOwner = role === 'owner'
      const isAdmin = role === 'admin'
      const isMember = role === 'member'
      const isViewer = role === 'viewer'

      // Check if resource belongs to the organization
      if (
        resource.organizationId &&
        resource.organizationId !== request.organization.organizationId
      ) {
        return false
      }

      // Owner and admin can do everything
      if (isOwner || isAdmin) return true

      // Members can read and write (but not delete in some cases)
      if (isMember) {
        if (action === 'read') return true
        if (action === 'write') return true
        if (action === 'delete') {
          // Members can delete their own resources
          const user = request.user as User | undefined
          if (resource.userId && user && resource.userId.toString() === user.id.toString()) {
            return true
          }
          return false
        }
      }

      // Viewers can only read
      if (isViewer) {
        return action === 'read'
      }

      return false
    }
  }
}

// Export a singleton instance for convenience
export const organizationMiddleware = createOrganizationMiddleware()
