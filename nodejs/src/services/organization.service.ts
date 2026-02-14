import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import type { MembershipRole, Organization, Prisma } from '@prisma/client'

// Zod Schemas for validation
export const MembershipRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer'])

export const CreateOrganizationParamsSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100, 'Organization name too long'),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  creatorId: z.union([z.string(), z.bigint()]),
  maxMembers: z.number().int().min(1).max(1000).optional().default(5),
  setAsCurrent: z.boolean().optional().default(true)
})

export const AddMemberParamsSchema = z.object({
  organizationId: z.union([z.string(), z.bigint()]),
  userId: z.union([z.string(), z.bigint()]),
  role: MembershipRoleSchema,
  invitedBy: z.union([z.string(), z.bigint()])
})

export const UpdateMemberRoleParamsSchema = z.object({
  organizationId: z.union([z.string(), z.bigint()]),
  userId: z.union([z.string(), z.bigint()]),
  role: MembershipRoleSchema
})

export const RemoveMemberParamsSchema = z.object({
  organizationId: z.union([z.string(), z.bigint()]),
  userId: z.union([z.string(), z.bigint()])
})

export const UpdateOrganizationDataSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  settings: z.record(z.unknown()).optional()
})

export const OrganizationIdParamsSchema = z.object({
  organizationId: z.union([z.string(), z.bigint()]),
  userId: z.union([z.string(), z.bigint()])
})

// Inferred types from Zod schemas
export type CreateOrganizationParams = z.infer<typeof CreateOrganizationParamsSchema>
export type AddMemberParams = z.infer<typeof AddMemberParamsSchema>
export type UpdateMemberRoleParams = z.infer<typeof UpdateMemberRoleParamsSchema>
export type RemoveMemberParams = z.infer<typeof RemoveMemberParamsSchema>
export type UpdateOrganizationData = z.infer<typeof UpdateOrganizationDataSchema>

// Result types (for API responses)
export interface OrganizationResult {
  id: string
  name: string
  slug: string
  avatarUrl: string | null
  plan: string
  maxMembers: number
  settings: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}

export interface OrganizationWithMembership extends OrganizationResult {
  membership: {
    role: MembershipRole
  }
}

export interface UserOrganization extends OrganizationResult {
  role: MembershipRole
  joinedAt: string
}

export interface MembershipResult {
  id: string
  organizationId: string
  userId: string
  role: MembershipRole
  invitedBy: string | null
  invitedAt: Date | null
  joinedAt: Date | null
}

function generateSlug (name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function generateUniqueSlug (baseSlug: string): Promise<string> {
  let slug = baseSlug
  let attempts = 0

  while (attempts < 10) {
    const existing = await prisma.organization.findUnique({
      where: { slug }
    })

    if (!existing) {
      return slug
    }

    attempts++
    slug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
  }

  throw new Error('Could not generate unique slug')
}

function toBigInt (value: string | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value)
}

function organizationToResult (org: Organization): OrganizationResult {
  return {
    ...org,
    id: org.id.toString()
  }
}

export interface OrganizationService {
  createOrganization (params: CreateOrganizationParams): Promise<OrganizationResult>
  getOrganization (organizationId: string | bigint, userId: string | bigint): Promise<OrganizationWithMembership | null>
  listUserOrganizations (userId: string | bigint): Promise<UserOrganization[]>
  addMember (params: AddMemberParams): Promise<MembershipResult>
  updateMemberRole (params: UpdateMemberRoleParams): Promise<MembershipResult>
  removeMember (params: RemoveMemberParams): Promise<void>
  switchOrganization (userId: string | bigint, organizationId: string | bigint): Promise<void>
  updateOrganization (organizationId: string | bigint, data: UpdateOrganizationData): Promise<OrganizationResult>
  deleteOrganization (organizationId: string | bigint, userId: string | bigint): Promise<void>
}

export function createOrganizationService (): OrganizationService {
  return {
    async createOrganization (params) {
      const validated = CreateOrganizationParamsSchema.parse(params)
      const { name, slug, creatorId, maxMembers = 5, setAsCurrent = true } = validated

      const baseSlug = slug ?? generateSlug(name)
      const uniqueSlug = await generateUniqueSlug(baseSlug)

      const organization = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name,
            slug: uniqueSlug,
            maxMembers,
            settings: {}
          }
        })

        await tx.membership.create({
          data: {
            organizationId: org.id,
            userId: toBigInt(creatorId),
            role: 'owner',
            joinedAt: new Date()
          }
        })

        if (setAsCurrent) {
          await tx.user.update({
            where: { id: toBigInt(creatorId) },
            data: { currentOrganizationId: org.id }
          })
        }

        return org
      })

      return organizationToResult(organization)
    },

    async getOrganization (organizationId, userId) {
      const validated = OrganizationIdParamsSchema.parse({ organizationId, userId })

      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: toBigInt(validated.organizationId),
          userId: toBigInt(validated.userId)
        },
        include: {
          organization: true
        }
      })

      if (!membership) {
        return null
      }

      return {
        ...organizationToResult(membership.organization),
        membership: {
          role: membership.role
        }
      }
    },

    async listUserOrganizations (userId) {
      const memberships = await prisma.membership.findMany({
        where: {
          userId: toBigInt(userId)
        },
        include: {
          organization: true
        },
        orderBy: {
          joinedAt: 'asc'
        }
      })

      return memberships.map((m) => ({
        ...organizationToResult(m.organization),
        role: m.role,
        joinedAt: m.joinedAt.toISOString()
      }))
    },

    async addMember (params) {
      const validated = AddMemberParamsSchema.parse(params)
      const { organizationId, userId, role, invitedBy } = validated

      const org = await prisma.organization.findUnique({
        where: { id: toBigInt(organizationId) },
        include: {
          _count: {
            select: { memberships: true }
          }
        }
      })

      if (!org) {
        throw new Error('Organization not found')
      }

      if (org._count.memberships >= org.maxMembers) {
        throw new Error('Organization has reached maximum number of members')
      }

      const existing = await prisma.membership.findFirst({
        where: {
          organizationId: toBigInt(organizationId),
          userId: toBigInt(userId)
        }
      })

      if (existing) {
        throw new Error('User is already a member of this organization')
      }

      const membership = await prisma.membership.create({
        data: {
          organizationId: toBigInt(organizationId),
          userId: toBigInt(userId),
          role,
          invitedBy: toBigInt(invitedBy),
          invitedAt: new Date(),
          joinedAt: new Date()
        }
      })

      return {
        ...membership,
        id: membership.id.toString(),
        organizationId: membership.organizationId.toString(),
        userId: membership.userId.toString(),
        invitedBy: membership.invitedBy?.toString() ?? null
      }
    },

    async updateMemberRole (params) {
      const validated = UpdateMemberRoleParamsSchema.parse(params)
      const { organizationId, userId, role } = validated

      if (role !== 'owner') {
        const membership = await prisma.membership.findFirst({
          where: {
            organizationId: toBigInt(organizationId),
            userId: toBigInt(userId)
          }
        })

        if (membership?.role === 'owner') {
          const ownerCount = await prisma.membership.count({
            where: {
              organizationId: toBigInt(organizationId),
              role: 'owner'
            }
          })

          if (ownerCount <= 1) {
            throw new Error('Cannot remove the last owner')
          }
        }
      }

      const membership = await prisma.membership.update({
        where: {
          organizationId_userId: {
            organizationId: toBigInt(organizationId),
            userId: toBigInt(userId)
          }
        },
        data: { role }
      })

      return {
        id: membership.id.toString(),
        organizationId: membership.organizationId.toString(),
        userId: membership.userId.toString(),
        role: membership.role,
        invitedBy: membership.invitedBy?.toString() ?? null,
        invitedAt: membership.invitedAt,
        joinedAt: membership.joinedAt
      }
    },

    async removeMember (params) {
      const validated = RemoveMemberParamsSchema.parse(params)
      const { organizationId, userId } = validated

      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: toBigInt(organizationId),
          userId: toBigInt(userId)
        }
      })

      if (membership?.role === 'owner') {
        const ownerCount = await prisma.membership.count({
          where: {
            organizationId: toBigInt(organizationId),
            role: 'owner'
          }
        })

        if (ownerCount <= 1) {
          throw new Error('Cannot remove the last owner')
        }
      }

      await prisma.membership.delete({
        where: {
          organizationId_userId: {
            organizationId: toBigInt(organizationId),
            userId: toBigInt(userId)
          }
        }
      })

      const user = await prisma.user.findUnique({
        where: { id: toBigInt(userId) }
      })

      if (user?.currentOrganizationId?.toString() === organizationId.toString()) {
        const anotherMembership = await prisma.membership.findFirst({
          where: {
            userId: toBigInt(userId),
            organizationId: { not: toBigInt(organizationId) }
          }
        })

        await prisma.user.update({
          where: { id: toBigInt(userId) },
          data: {
            currentOrganizationId: anotherMembership?.organizationId ?? null
          }
        })
      }
    },

    async switchOrganization (userId, organizationId) {
      const membership = await prisma.membership.findFirst({
        where: {
          userId: toBigInt(userId),
          organizationId: toBigInt(organizationId)
        }
      })

      if (!membership) {
        throw new Error('User is not a member of this organization')
      }

      await prisma.user.update({
        where: { id: toBigInt(userId) },
        data: { currentOrganizationId: toBigInt(organizationId) }
      })
    },

    async updateOrganization (organizationId, data) {
      const validated = UpdateOrganizationDataSchema.parse(data)
      const updateData: Prisma.OrganizationUpdateInput = {}

      if (validated.name !== undefined) {
        updateData.name = validated.name
      }

      if (validated.avatarUrl !== undefined) {
        updateData.avatarUrl = validated.avatarUrl
      }

      if (validated.settings !== undefined) {
        updateData.settings = validated.settings as Prisma.InputJsonValue
      }

      const org = await prisma.organization.update({
        where: { id: toBigInt(organizationId) },
        data: updateData
      })

      return organizationToResult(org)
    },

    async deleteOrganization (organizationId, userId) {
      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: toBigInt(organizationId),
          userId: toBigInt(userId),
          role: 'owner'
        }
      })

      if (!membership) {
        throw new Error('Only owners can delete organizations')
      }

      await prisma.organization.delete({
        where: { id: toBigInt(organizationId) }
      })
    }
  }
}
