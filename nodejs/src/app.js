import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';

import { prisma } from './db/prisma.js';
import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { wsManager } from './websocket/manager.js';
import { authenticateRequest, authenticateAdmin } from './middleware/auth.js';
import { archiveScheduler } from './services/archiveScheduler.js';

dotenv.config();

export default async function app (fastify, opts) {
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || '*'
  })

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production'
  })

  await fastify.register(multipart);

  await fastify.register(websocket)

  fastify.decorate('authenticate', authenticateRequest);
  fastify.decorate('authenticateAdmin', authenticateAdmin);
  fastify.decorate('prisma', prisma);

  fastify.setSerializerCompiler(({ schema, method, url, httpStatus }) => {
    return (data) => JSON.stringify(data, (_key, value) => {
      return typeof value === 'bigint' ? value.toString() : value
    })
  })

  fastify.get('/up', async (request, reply) => {
    return { status: 'ok' }
  })

  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, async (connection, req) => {
      const token = req.query.token

      if (!token) {
        connection.socket.close(1008, 'No token provided')
        return
      }

      try {
        const apiToken = await prisma.apiToken.findUnique({
          where: { token },
          include: { user: true }
        })

        if (!apiToken) {
          connection.socket.close(1008, 'Invalid token')
          return
        }

        await prisma.apiToken.update({
          where: { id: apiToken.id },
          data: { lastUsedAt: new Date() }
        })

        const userId = apiToken.userId

        wsManager.addClient(userId, connection)

        console.log(`WebSocket client connected for user ${userId}`)

      } catch (error) {
        console.error('WebSocket authentication failed:', error)
        connection.socket.close(1008, 'Authentication failed')
      }
    })
  })

  await fastify.register(registerRoutes, { prefix: '/api/v1' })

  fastify.setErrorHandler(errorHandler)

  // Start archive scheduler
  archiveScheduler.start()

  fastify.addHook('onClose', async (instance) => {
    archiveScheduler.stop()
    await instance.prisma.$disconnect()
  })
}
