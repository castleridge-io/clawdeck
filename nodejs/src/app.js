import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'

import { prisma } from './db/prisma.js'
import { registerRoutes } from './routes/index.js'
import { errorHandler } from './middleware/errorHandler.js'
import { wsManager } from './websocket/manager.js'

dotenv.config()

export default async function app (fastify, opts) {
  // Register plugins
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || '*'
  })

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production'
  })

  await fastify.register(websocket)

  // Make prisma available globally
  fastify.decorate('prisma', prisma)

  // Override Fastify's default JSON serializer to handle BigInt
  fastify.setSerializerCompiler(({ schema, method, url, httpStatus }) => {
    return (data) => JSON.stringify(data, (_key, value) => {
      return typeof value === 'bigint' ? value.toString() : value
    })
  })

  // Health check
  fastify.get('/up', async (request, reply) => {
    return { status: 'ok' }
  })

  // WebSocket endpoint for real-time updates (must be before API routes)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, async (connection, req) => {
      // Extract API token from query params
      const token = req.query.token

      if (!token) {
        connection.socket.close(1008, 'No token provided')
        return
      }

      try {
        // Verify API token against database (same as REST API)
        const apiToken = await prisma.apiToken.findUnique({
          where: { token },
          include: { user: true }
        })

        if (!apiToken) {
          connection.socket.close(1008, 'Invalid token')
          return
        }

        // Update last used timestamp
        await prisma.apiToken.update({
          where: { id: apiToken.id },
          data: { lastUsedAt: new Date() }
        })

        const userId = apiToken.userId

        // Add client to manager
        wsManager.addClient(userId, connection)

        console.log(`WebSocket client connected for user ${userId}`)

      } catch (error) {
        console.error('WebSocket authentication failed:', error)
        connection.socket.close(1008, 'Authentication failed')
      }
    })
  })

  // Register API routes
  await fastify.register(registerRoutes, { prefix: '/api/v1' })

  // Error handler
  fastify.setErrorHandler(errorHandler)

  // Graceful shutdown
  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })
}
