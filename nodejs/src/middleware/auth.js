import { prisma } from '../db/prisma.js';
import { createAuthService } from '../services/auth.service.js';

/**
 * Authenticate requests using either:
 * 1. JWT session token (Bearer token from login)
 * 2. API token (Bearer token for API access)
 * 3. Agent headers (X-Agent-Name, X-Agent-Emoji for agent identification)
 */
export async function authenticateRequest(request, reply) {
  const authService = createAuthService(request.server);
  const authHeader = request.headers.authorization;
  const agentName = request.headers['x-agent-name'];
  const agentEmoji = request.headers['x-agent-emoji'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const token = authHeader.substring(7);

  let user = null;

  user = await authService.verifySessionToken(token);

  if (!user) {
    user = await authService.verifyApiToken(token);
  }

  if (!user) {
    const error = new Error('Invalid token');
    error.statusCode = 401;
    throw error;
  }

  request.user = user;
  request.agentName = agentName || user.agentName;
  request.agentEmoji = agentEmoji || user.agentEmoji;

  if (agentName || agentEmoji) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        agentName: agentName || user.agentName,
        agentEmoji: agentEmoji || user.agentEmoji,
        agentLastActiveAt: new Date(),
      },
    });
  }
}

/**
 * Authenticate requests with admin role requirement
 */
export async function authenticateAdmin(request, reply) {
  await authenticateRequest(request, reply);

  if (!request.user.admin) {
    const error = new Error('Forbidden: Admin access required');
    error.statusCode = 403;
    throw error;
  }
}

/**
 * Optional authentication - attaches user if valid token provided,
 * but doesn't throw if missing/invalid
 */
export async function optionalAuthenticate(request, reply) {
  const authService = createAuthService(request.server);
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.substring(7);
  let user = null;

  try {
    user = await authService.verifySessionToken(token);

    if (!user) {
      user = await authService.verifyApiToken(token);
    }
  } catch {
    return;
  }

  if (user) {
    request.user = user;
    request.agentName = request.headers['x-agent-name'] || user.agentName;
    request.agentEmoji = request.headers['x-agent-emoji'] || user.agentEmoji;
  }
}

/**
 * Decorator to apply authentication to routes
 */
export async function authenticateRoutes(fastify) {
  fastify.addHook('onRequest', authenticateRequest);
}

/**
 * Decorator to apply admin authentication to routes
 */
export async function authenticateAdminRoutes(fastify) {
  fastify.addHook('onRequest', authenticateAdmin);
}
