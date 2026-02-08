import { boardsRoutes } from './boards.js'
import { tasksRoutes } from './tasks.js'
import { settingsRoutes } from './settings.js'

export async function registerRoutes (fastify, opts) {
  // Register all route modules
  await fastify.register(boardsRoutes, { prefix: '/boards' })
  await fastify.register(tasksRoutes, { prefix: '/tasks' })
  await fastify.register(settingsRoutes, { prefix: '/settings' })
}
