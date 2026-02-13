import { authenticateRequest, authenticateAdmin } from '../middleware/auth.js'
import { prisma } from '../db/prisma.js'
import { randomUUID } from 'node:crypto'
import { createSettingsService } from '../services/settings.service.js'

export async function settingsRoutes (fastify, opts) {
  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)
  const settingsService = createSettingsService()

  // GET /api/v1/settings - Get user settings (agent config)
  fastify.get('/', async (request) => {
    const apiTokens = await prisma.apiToken.findMany({
      where: { userId: BigInt(request.user.id) },
      orderBy: { createdAt: 'desc' },
    })

    return {
      success: true,
      data: {
        id: request.user.id.toString(),
        email: request.user.emailAddress,
        agent_auto_mode: request.user.agentAutoMode,
        agent_name: request.user.agentName,
        agent_emoji: request.user.agentEmoji,
        agent_last_active_at: request.user.agentLastActiveAt?.toISOString(),
        api_tokens: apiTokens.map((t) => ({
          id: t.id.toString(),
          name: t.name,
          token: t.token,
          last_used_at: t.lastUsedAt?.toISOString(),
          created_at: t.createdAt.toISOString(),
        })),
      },
    }
  })

  // PATCH /api/v1/settings - Update user settings
  fastify.patch('/', async (request, reply) => {
    const { agent_auto_mode, agent_name, agent_emoji } = request.body

    const updateData = {}
    if (agent_auto_mode !== undefined) {
      updateData.agentAutoMode = agent_auto_mode
    }
    if (agent_name !== undefined) {
      updateData.agentName = agent_name
    }
    if (agent_emoji !== undefined) {
      updateData.agentEmoji = agent_emoji
    }

    const updatedUser = await prisma.user.update({
      where: { id: BigInt(request.user.id) },
      data: updateData,
    })

    return {
      success: true,
      data: {
        id: updatedUser.id.toString(),
        email: updatedUser.emailAddress,
        agent_auto_mode: updatedUser.agentAutoMode,
        agent_name: updatedUser.agentName,
        agent_emoji: updatedUser.agentEmoji,
        agent_last_active_at: updatedUser.agentLastActiveAt?.toISOString(),
      },
    }
  })

  // POST /api/v1/settings/regenerate_token - Generate new API token
  fastify.post('/regenerate_token', async (request, reply) => {
    const { name } = request.body

    const token = `cd_${randomUUID()}`

    const apiToken = await prisma.apiToken.create({
      data: {
        token,
        name: name || 'API Token',
        userId: BigInt(request.user.id),
      },
    })

    return reply.code(201).send({
      success: true,
      data: {
        id: apiToken.id.toString(),
        name: apiToken.name,
        token: apiToken.token,
        created_at: apiToken.createdAt.toISOString(),
      },
    })
  })

  // ============================================
  // OpenClaw Settings Routes (Admin only)
  // ============================================

  // GET /api/v1/settings/openclaw - Get OpenClaw settings
  fastify.get('/openclaw', { preHandler: authenticateAdmin }, async (request, reply) => {
    const settings = await settingsService.getOpenClawSettings()
    return {
      success: true,
      data: settings,
    }
  })

  // PATCH /api/v1/settings/openclaw - Update OpenClaw settings
  fastify.patch('/openclaw', { preHandler: authenticateAdmin }, async (request, reply) => {
    const { url, apiKey } = request.body

    const settings = await settingsService.updateOpenClawSettings({ url, apiKey })
    return {
      success: true,
      data: settings,
    }
  })

  // POST /api/v1/settings/openclaw/test - Test OpenClaw connection
  fastify.post('/openclaw/test', { preHandler: authenticateAdmin }, async (request, reply) => {
    const result = await settingsService.testOpenClawConnection()
    return {
      success: result.success,
      data: result,
    }
  })

  // DELETE /api/v1/settings/openclaw/api-key - Clear OpenClaw API key
  fastify.delete('/openclaw/api-key', { preHandler: authenticateAdmin }, async (request, reply) => {
    await settingsService.clearOpenClawApiKey()
    return reply.code(204).send()
  })
}
