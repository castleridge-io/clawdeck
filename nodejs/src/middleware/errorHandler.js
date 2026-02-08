/**
 * Global error handler
 */
export function errorHandler (error, request, reply) {
  request.log.error(error)

  // Handle Prisma errors
  if (error.code?.startsWith('P')) {
    return reply.code(400).send({
      error: 'Database error',
      details: error.message
    })
  }

  // Handle validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation error',
      details: error.validation
    })
  }

  // Default error response
  return reply.code(error.statusCode || 500).send({
    error: error.message || 'Internal server error'
  })
}
