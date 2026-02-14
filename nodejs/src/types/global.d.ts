import type { User, PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

// Extend @fastify/jwt user type so request.user is properly typed
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: User
  }
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyRequest {
    agentName: string | null
    agentEmoji: string | null
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    prisma: PrismaClient
  }
}
