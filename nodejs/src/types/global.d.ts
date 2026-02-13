import type { User, PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    user: User
    agentName: string | null
    agentEmoji: string | null
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    prisma: PrismaClient
  }
}
