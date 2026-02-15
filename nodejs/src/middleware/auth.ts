import type {
  FastifyRequest,
  FastifyReply,
  FastifyInstance,
} from 'fastify'
import { prisma } from '../db/prisma.js'
import type { User } from '@prisma/client'
import { createAuthService } from '../services/auth.service.js'

// Extend @fastify/jwt user type so request.user is properly typed
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: User
  }
}

// Extend FastifyRequest with additional properties
declare module 'fastify' {
  interface FastifyRequest {
    agentName: string | null
    agentEmoji: string | null
  }
}

/**
 * Authenticate requests using either:
 * 1. JWT session token (Bearer token from login)
 * 2. API token (Bearer token for API access)
 * 3. Agent headers (X-Agent-Name, X-Agent-Emoji for agent identification)
 */
export async function authenticateRequest (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authService = createAuthService(request.server)
  const authHeader = request.headers.authorization
  const agentName = request.headers['x-agent-name'] as string | undefined
  const agentEmoji = request.headers['x-agent-emoji'] as string | undefined

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Unauthorized') as Error & { statusCode?: number }
    error.statusCode = 401
    throw error
  }

  const token = authHeader.substring(7)

  let user: User | null = null

  user = await authService.verifySessionToken(token)

  if (!user) {
    user = await authService.verifyApiToken(token)
  }

  if (!user) {
    const error = new Error('Invalid token') as Error & { statusCode?: number }
    error.statusCode = 401
    throw error
  }

  request.user = user
  request.agentName = agentName ?? user.agentName ?? null
  request.agentEmoji = agentEmoji ?? user.agentEmoji ?? null

  if (agentName || agentEmoji) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        agentName: agentName ?? user.agentName,
        agentEmoji: agentEmoji ?? user.agentEmoji,
        agentLastActiveAt: new Date(),
      },
    })
  }
}

/**
 * Authenticate requests with admin role requirement
 */
export async function authenticateAdmin (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticateRequest(request, reply)

  if (!request.user.admin) {
    const error = new Error('Forbidden: Admin access required') as Error & { statusCode?: number }
    error.statusCode = 403
    throw error
  }
}

/**
 * Optional authentication - attaches user if valid token provided,
 * but doesn't throw if missing/invalid
 */
export async function optionalAuthenticate (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authService = createAuthService(request.server)
  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return
  }

  const token = authHeader.substring(7)
  let user: User | null = null

  try {
    user = await authService.verifySessionToken(token)

    if (!user) {
      user = await authService.verifyApiToken(token)
    }
  } catch {
    return
  }

  if (user) {
    request.user = user
    request.agentName =
      (request.headers['x-agent-name'] as string | undefined) ?? user.agentName ?? null
    request.agentEmoji =
      (request.headers['x-agent-emoji'] as string | undefined) ?? user.agentEmoji ?? null
  }
}

/**
 * Decorator to apply authentication to routes
 */
export async function authenticateRoutes (fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateRequest)
}

/**
 * Decorator to apply admin authentication to routes
 */
export async function authenticateAdminRoutes (fastify: FastifyInstance): Promise<void> {
  fastify.addHook('onRequest', authenticateAdmin)
}
