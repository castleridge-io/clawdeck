// Type declarations for existing JS modules
// These are shim declarations to provide types for JS-only modules

declare module '*/db/prisma.js' {
  import { PrismaClient } from '@prisma/client'
  export const prisma: PrismaClient
}

declare module '*/middleware/auth.js' {
  import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction, FastifyInstance } from 'fastify'

  export function authenticateRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void

  export function authenticateAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void

  export function optionalAuthenticate(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void

  export function authenticateRoutes(fastify: FastifyInstance): Promise<void>
  export function authenticateAdminRoutes(fastify: FastifyInstance): Promise<void>
}
