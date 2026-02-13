import type { User } from '@prisma/client'

declare module 'fastify' {
  interface FastifyRequest {
    user: User
    agentName: string | null
    agentEmoji: string | null
  }

  interface FastifyInstance {
    authenticate: typeof import('../middleware/auth').authenticateRequest
    authenticateAdmin: typeof import('../middleware/auth').authenticateAdmin
    prisma: typeof import('../db/prisma').prisma
  }
}

export type { User }
