import { authenticateRequest } from '../middleware/auth.js'
import { createWorkflowService } from '../services/workflow.service.js'

// Helper function to convert workflow to JSON response
function workflowToJson(workflow) {
  return {
    id: workflow.id.toString(),
    name: workflow.name,
    description: workflow.description,
    config: workflow.config,
    created_at: workflow.createdAt.toISOString(),
    updated_at: workflow.updatedAt.toISOString()
  }
}

export async function workflowsRoutes(fastify, opts) {
  const workflowService = createWorkflowService()

  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/workflows - List workflows
  fastify.get('/', async (request, reply) => {
    const { name } = request.query

    const filters = {}
    if (name) {
      filters.name = name
    }

    const workflows = await workflowService.listWorkflows(filters)

    return {
      success: true,
      data: workflows.map(workflowToJson)
    }
  })

  // GET /api/v1/workflows/:id - Get single workflow
  fastify.get('/:id', async (request, reply) => {
    const workflow = await workflowService.getWorkflow(request.params.id)

    if (!workflow) {
      return reply.code(404).send({ error: 'Workflow not found' })
    }

    return {
      success: true,
      data: workflowToJson(workflow)
    }
  })

  // POST /api/v1/workflows - Create workflow
  fastify.post('/', async (request, reply) => {
    const { name, description, steps } = request.body

    try {
      const workflow = await workflowService.createWorkflow({
        name,
        description,
        steps
      })

      return reply.code(201).send({
        success: true,
        data: workflowToJson(workflow)
      })
    } catch (error) {
      if (error.message.includes('is required') || error.message.includes('must be an array')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // DELETE /api/v1/workflows/:id - Delete workflow
  fastify.delete('/:id', async (request, reply) => {
    try {
      await workflowService.deleteWorkflow(request.params.id)
      return reply.code(204).send()
    } catch (error) {
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message })
      }
      if (error.message.includes('Cannot delete')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })
}
