import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { boardsRoutes } from './boards.js'
import { tasksRoutes } from './tasks.js'
import { settingsRoutes } from './settings.js'
import { authRoutes } from './auth.routes.js'
import { adminRoutes } from './admin.routes.js'
import { avatarRoutes } from './avatars.routes.js'
import { archivesRoutes } from './archives.js'
import { workflowsRoutes } from './workflows.js'
import { runsRoutes } from './runs.js'
import { stepsRoutes } from './steps.js'
import { storiesRoutes } from './stories.js'
import { agentsRoutes } from './agents.js'

export async function registerRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  await fastify.register(authRoutes, { prefix: '/auth' })
  await fastify.register(boardsRoutes, { prefix: '/boards' })
  await fastify.register(tasksRoutes, { prefix: '/tasks' })
  await fastify.register(settingsRoutes, { prefix: '/settings' })
  await fastify.register(adminRoutes, { prefix: '/admin' })
  await fastify.register(avatarRoutes, { prefix: '/avatars' })
  await fastify.register(archivesRoutes, { prefix: '/archives' })
  await fastify.register(workflowsRoutes, { prefix: '/workflows' })
  await fastify.register(runsRoutes, { prefix: '/runs' })
  await fastify.register(agentsRoutes, { prefix: '/agents' })
  // Nested routes under runs
  await fastify.register(stepsRoutes, { prefix: '/runs/:runId/steps' })
  await fastify.register(storiesRoutes, { prefix: '/runs/:runId/stories' })
}
