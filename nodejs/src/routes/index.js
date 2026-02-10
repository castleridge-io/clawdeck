import { boardsRoutes } from './boards.js';
import { tasksRoutes } from './tasks.js';
import { settingsRoutes } from './settings.js';
import { authRoutes } from './auth.routes.js';
import { adminRoutes } from './admin.routes.js';
import { avatarRoutes } from './avatars.routes.js';
import { archivesRoutes } from './archives.js';

export async function registerRoutes(fastify, opts) {
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(boardsRoutes, { prefix: '/boards' });
  await fastify.register(tasksRoutes, { prefix: '/tasks' });
  await fastify.register(settingsRoutes, { prefix: '/settings' });
  await fastify.register(adminRoutes, { prefix: '/admin' });
  await fastify.register(avatarRoutes, { prefix: '/avatars' });
  await fastify.register(archivesRoutes, { prefix: '/archives' });
}
