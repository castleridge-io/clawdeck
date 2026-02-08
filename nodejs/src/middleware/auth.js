import { prisma } from '../db/prisma.js'

/**
 * Authenticate API requests using Bearer token
 * Extracts agent identity from X-Agent-Name and X-Agent-Emoji headers
 */
export async function authenticateRequest (request, reply) {
  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }

  const token = authHeader.substring(7)

  // Find API token with user
  const apiToken = await prisma.apiToken.findUnique({
    where: { token },
    include: { user: true }
  })

  if (!apiToken) {
    const error = new Error('Invalid token')
    error.statusCode = 401
    throw error
  }

  // Update last used timestamp
  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() }
  })

  // Attach user and agent info to request
  request.user = apiToken.user
  request.agentName = request.headers['x-agent-name'] || apiToken.user.agentName
  request.agentEmoji = request.headers['x-agent-emoji'] || apiToken.user.agentEmoji

  // Update agent last active timestamp
  if (request.agentName) {
    await prisma.user.update({
      where: { id: apiToken.userId },
      data: {
        agentName: request.agentName,
        agentEmoji: request.agentEmoji,
        agentLastActiveAt: new Date()
      }
    })
  }
}

/**
 * Decorator to apply authentication to routes
 */
export async function authenticateRoutes (fastify) {
  fastify.addHook('onRequest', authenticateRequest)
}
