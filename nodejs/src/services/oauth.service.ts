import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import crypto from 'crypto'
import type { User, Organization, Prisma } from '@prisma/client'

// Zod Schemas
export const OAuthProviderSchema = z.enum(['google', 'github'])

export const OAuthProfileEmailSchema = z.object({
  value: z.string().email(),
  verified: z.boolean().optional().default(false)
})

export const OAuthProfilePhotoSchema = z.object({
  value: z.string().url()
})

export const OAuthProfileSchema = z.object({
  id: z.union([z.string(), z.number()]),
  displayName: z.string().optional(),
  username: z.string().optional(),
  name: z.object({
    givenName: z.string().optional(),
    familyName: z.string().optional()
  }).optional(),
  emails: z.array(OAuthProfileEmailSchema).optional(),
  photos: z.array(OAuthProfilePhotoSchema).optional(),
  _json: z.record(z.string(), z.unknown()).optional()
})

export const OAuthResultSchema = z.object({
  user: z.object({
    id: z.string(),
    emailAddress: z.string(),
    agentName: z.string().nullable(),
    avatarUrl: z.string().nullable()
  }),
  organization: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string()
  }).nullable(),
  isNewUser: z.boolean(),
  needsOrgAssignment: z.boolean()
})

export const LinkedAccountSchema = z.object({
  provider: OAuthProviderSchema,
  providerId: z.string(),
  createdAt: z.date()
})

export const UnlinkAccountParamsSchema = z.object({
  userId: z.union([z.string(), z.bigint()]),
  provider: OAuthProviderSchema
})

// Inferred types
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>
export type OAuthProfile = z.infer<typeof OAuthProfileSchema>
export type OAuthResult = z.infer<typeof OAuthResultSchema>
export type LinkedAccount = z.infer<typeof LinkedAccountSchema>

// Result types for API responses
export interface UserResult {
  id: string
  emailAddress: string
  agentName: string | null
  avatarUrl: string | null
}

export interface OrganizationResult {
  id: string
  name: string
  slug: string
}

// In-memory store for OAuth state tokens (use Redis in production)
const stateTokens = new Map<string, number>()

function cleanupExpiredStates (): void {
  const now = Date.now()
  for (const [token, expiry] of stateTokens.entries()) {
    if (expiry < now) {
      stateTokens.delete(token)
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupExpiredStates, 5 * 60 * 1000)

function getEmailFromProfile (profile: OAuthProfile): string | null {
  if (profile.emails && profile.emails.length > 0) {
    const verified = profile.emails.find((e) => e.verified)
    if (verified) return verified.value
    return profile.emails[0].value
  }
  return null
}

function getDisplayName (profile: OAuthProfile): string {
  return (
    profile.displayName ||
    profile.username ||
    profile.name?.givenName ||
    getEmailFromProfile(profile)?.split('@')[0] ||
    'User'
  )
}

function getAvatarUrl (profile: OAuthProfile): string | null {
  if (profile.photos && profile.photos.length > 0) {
    return profile.photos[0].value
  }
  return null
}

function toBigInt (value: string | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value)
}

function userToResult (user: User): UserResult {
  return {
    id: user.id.toString(),
    emailAddress: user.emailAddress,
    agentName: user.agentName,
    avatarUrl: user.avatarUrl
  }
}

function organizationToResult (org: Organization): OrganizationResult {
  return {
    id: org.id.toString(),
    name: org.name,
    slug: org.slug
  }
}

export interface OAuthService {
  findOrCreateUserFromGoogle (profile: OAuthProfile, accessToken: string, refreshToken: string | null): Promise<OAuthResult>
  findOrCreateUserFromGitHub (profile: OAuthProfile, accessToken: string, refreshToken: string | null): Promise<OAuthResult>
  unlinkOAuthAccount (userId: string | bigint, provider: OAuthProvider): Promise<void>
  getLinkedAccounts (userId: string | bigint): Promise<LinkedAccount[]>
  generateOAuthState (): Promise<string>
  verifyOAuthState (token: string): Promise<boolean>
}

export function createOAuthService (): OAuthService {
  return {
    async findOrCreateUserFromGoogle (profile, accessToken, refreshToken) {
      const validatedProfile = OAuthProfileSchema.parse(profile)
      const providerId = validatedProfile.id.toString()
      const email = getEmailFromProfile(validatedProfile)

      if (!email) {
        throw new Error('No email found in Google profile')
      }

      // Check if OAuth account already exists
      const existingOAuth = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerId: {
            provider: 'google',
            providerId
          }
        },
        include: {
          user: true
        }
      })

      if (existingOAuth) {
        // Update tokens
        await prisma.oAuthAccount.update({
          where: { id: existingOAuth.id },
          data: {
            accessToken,
            refreshToken: refreshToken ?? existingOAuth.refreshToken,
            tokenExpiresAt: null
          }
        })

        // Get user's current organization
        const membership = await prisma.membership.findFirst({
          where: { userId: existingOAuth.userId },
          include: { organization: true }
        })

        return {
          user: userToResult(existingOAuth.user),
          organization: membership?.organization ? organizationToResult(membership.organization) : null,
          isNewUser: false,
          needsOrgAssignment: !membership
        }
      }

      // Check if user exists with this email
      const existingUser = await prisma.user.findUnique({
        where: { emailAddress: email }
      })

      if (existingUser) {
        // Link OAuth account to existing user
        await prisma.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider: 'google',
            providerId,
            accessToken,
            refreshToken,
            profileData: (validatedProfile._json ?? {}) as Prisma.InputJsonValue
          }
        })

        // Get user's current organization
        const membership = await prisma.membership.findFirst({
          where: { userId: existingUser.id },
          include: { organization: true }
        })

        return {
          user: userToResult(existingUser),
          organization: membership?.organization ? organizationToResult(membership.organization) : null,
          isNewUser: false,
          needsOrgAssignment: !membership
        }
      }

      // Create new user with organization
      const displayName = getDisplayName(validatedProfile)
      const avatarUrl = getAvatarUrl(validatedProfile)

      const result = await prisma.$transaction(async (tx) => {
        // Create user
        const user = await tx.user.create({
          data: {
            emailAddress: email,
            passwordDigest: null,
            agentAutoMode: true,
            agentName: displayName,
            agentEmoji: '🤖',
            avatarUrl
          }
        })

        // Create default organization
        const orgSlug = `${displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`
        const organization = await tx.organization.create({
          data: {
            name: `${displayName}'s Workspace`,
            slug: orgSlug,
            settings: {}
          }
        })

        // Create membership
        await tx.membership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: 'owner',
            joinedAt: new Date()
          }
        })

        // Set current organization
        await tx.user.update({
          where: { id: user.id },
          data: { currentOrganizationId: organization.id }
        })

        // Create OAuth account
        await tx.oAuthAccount.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerId,
            accessToken,
            refreshToken,
            profileData: (validatedProfile._json ?? {}) as Prisma.InputJsonValue
          }
        })

        return { user, organization }
      })

      return {
        user: userToResult(result.user),
        organization: organizationToResult(result.organization),
        isNewUser: true,
        needsOrgAssignment: false
      }
    },

    async findOrCreateUserFromGitHub (profile, accessToken, refreshToken) {
      const validatedProfile = OAuthProfileSchema.parse(profile)
      const providerId = validatedProfile.id?.toString() ?? validatedProfile.username ?? ''
      const email = getEmailFromProfile(validatedProfile)

      if (!email) {
        throw new Error('No email found in GitHub profile')
      }

      // Check if OAuth account already exists
      const existingOAuth = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerId: {
            provider: 'github',
            providerId
          }
        },
        include: {
          user: true
        }
      })

      if (existingOAuth) {
        // Update token
        await prisma.oAuthAccount.update({
          where: { id: existingOAuth.id },
          data: {
            accessToken,
            refreshToken: refreshToken ?? existingOAuth.refreshToken
          }
        })

        // Get user's current organization
        const membership = await prisma.membership.findFirst({
          where: { userId: existingOAuth.userId },
          include: { organization: true }
        })

        return {
          user: userToResult(existingOAuth.user),
          organization: membership?.organization ? organizationToResult(membership.organization) : null,
          isNewUser: false,
          needsOrgAssignment: !membership
        }
      }

      // Check if user exists with this email
      const existingUser = await prisma.user.findUnique({
        where: { emailAddress: email }
      })

      if (existingUser) {
        // Link OAuth account to existing user
        await prisma.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider: 'github',
            providerId,
            accessToken,
            refreshToken,
            profileData: (validatedProfile._json ?? {}) as Prisma.InputJsonValue
          }
        })

        // Get user's current organization
        const membership = await prisma.membership.findFirst({
          where: { userId: existingUser.id },
          include: { organization: true }
        })

        return {
          user: userToResult(existingUser),
          organization: membership?.organization ? organizationToResult(membership.organization) : null,
          isNewUser: false,
          needsOrgAssignment: !membership
        }
      }

      // Create new user with organization
      const displayName = getDisplayName(validatedProfile)
      const avatarUrl = getAvatarUrl(validatedProfile)

      const result = await prisma.$transaction(async (tx) => {
        // Create user
        const user = await tx.user.create({
          data: {
            emailAddress: email,
            passwordDigest: null,
            agentAutoMode: true,
            agentName: displayName,
            agentEmoji: '🤖',
            avatarUrl
          }
        })

        // Create default organization
        const orgSlug = `${displayName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`
        const organization = await tx.organization.create({
          data: {
            name: `${displayName}'s Workspace`,
            slug: orgSlug,
            settings: {}
          }
        })

        // Create membership
        await tx.membership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: 'owner',
            joinedAt: new Date()
          }
        })

        // Set current organization
        await tx.user.update({
          where: { id: user.id },
          data: { currentOrganizationId: organization.id }
        })

        // Create OAuth account
        await tx.oAuthAccount.create({
          data: {
            userId: user.id,
            provider: 'github',
            providerId,
            accessToken,
            refreshToken,
            profileData: (validatedProfile._json ?? {}) as Prisma.InputJsonValue
          }
        })

        return { user, organization }
      })

      return {
        user: userToResult(result.user),
        organization: organizationToResult(result.organization),
        isNewUser: true,
        needsOrgAssignment: false
      }
    },

    async unlinkOAuthAccount (userId, provider) {
      const validated = UnlinkAccountParamsSchema.parse({ userId, provider })

      const user = await prisma.user.findUnique({
        where: { id: toBigInt(validated.userId) }
      })

      if (!user) {
        throw new Error('User not found')
      }

      // Check if user has other login methods
      const oauthAccounts = await prisma.oAuthAccount.findMany({
        where: { userId: toBigInt(validated.userId) }
      })

      const hasPassword = !!user.passwordDigest
      const hasOtherOAuth = oauthAccounts.some((a) => a.provider !== validated.provider)

      if (!hasPassword && !hasOtherOAuth) {
        throw new Error(
          'Cannot unlink the last login method. Please set a password or link another OAuth provider first.'
        )
      }

      await prisma.oAuthAccount.deleteMany({
        where: {
          userId: toBigInt(validated.userId),
          provider: validated.provider
        }
      })
    },

    async getLinkedAccounts (userId) {
      const accounts = await prisma.oAuthAccount.findMany({
        where: { userId: toBigInt(userId) },
        select: {
          provider: true,
          providerId: true,
          createdAt: true
        }
      })

      return accounts.map((a) => LinkedAccountSchema.parse({
        provider: a.provider as OAuthProvider,
        providerId: a.providerId,
        createdAt: a.createdAt
      }))
    },

    async generateOAuthState () {
      const token = crypto.randomBytes(32).toString('hex')
      // State token expires in 10 minutes
      stateTokens.set(token, Date.now() + 10 * 60 * 1000)
      return token
    },

    async verifyOAuthState (token) {
      const expiry = stateTokens.get(token)
      if (!expiry) {
        return false
      }

      // Delete token (one-time use)
      stateTokens.delete(token)

      // Check if expired
      if (expiry < Date.now()) {
        return false
      }

      return true
    }
  }
}
