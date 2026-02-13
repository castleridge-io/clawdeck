import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify'

interface ErrorResponse {
  error: string
  details?: unknown
}

/**
 * Global error handler
 */
export function errorHandler (
  error: FastifyError & { validation?: unknown },
  request: FastifyRequest,
  reply: FastifyReply
): FastifyReply {
  request.log.error(error)

  // Handle Prisma errors
  if (error.code?.startsWith('P')) {
    return reply.code(400).send({
      error: 'Database error',
      details: error.message,
    } as ErrorResponse)
  }

  // Handle validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation error',
      details: error.validation,
    } as ErrorResponse)
  }

  // Default error response
  return reply.code(error.statusCode || 500).send({
    error: error.message || 'Internal server error',
  } as ErrorResponse)
}
