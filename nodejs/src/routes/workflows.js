import { authenticateRequest } from '../middleware/auth.js'
import { createWorkflowService } from '../services/workflow.service.js'
import { parseWorkflowYaml } from '../services/yaml-import.service.js'

// Helper function to convert workflow to JSON response
function workflowToJson (workflow) {
  if (!workflow) return null
  return {
    id: workflow.id.toString ? workflow.id.toString() : workflow.id,
    name: workflow.name,
    description: workflow.description,
    steps: workflow.steps || [],
    created_at: workflow.createdAt ? workflow.createdAt.toISOString() : workflow.created_at,
    updated_at: workflow.updatedAt ? workflow.updatedAt.toISOString() : workflow.updated_at,
  }
}

export async function workflowsRoutes (fastify, opts) {
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
      data: workflows.map(workflowToJson),
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
      data: workflowToJson(workflow),
    }
  })

  // POST /api/v1/workflows - Create workflow
  fastify.post('/', async (request, reply) => {
    const { name, description, steps } = request.body

    try {
      const workflow = await workflowService.createWorkflow({
        name,
        description,
        steps,
      })

      return reply.code(201).send({
        success: true,
        data: workflowToJson(workflow),
      })
    } catch (error) {
      if (error.message.includes('is required') || error.message.includes('must be an array')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // PATCH /api/v1/workflows/:id - Update workflow
  fastify.patch('/:id', async (request, reply) => {
    const { name, description, steps } = request.body

    try {
      const workflow = await workflowService.updateWorkflow(request.params.id, {
        name,
        description,
        steps,
      })

      if (!workflow) {
        return reply.code(404).send({ error: 'Workflow not found' })
      }

      return {
        success: true,
        data: workflowToJson(workflow),
      }
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

  // POST /api/v1/workflows/import-yaml - Import workflow from YAML
  fastify.post('/import-yaml', async (request, reply) => {
    const { yaml } = request.body

    if (!yaml) {
      return reply.code(400).send({ error: 'yaml is required' })
    }

    try {
      const workflowData = parseWorkflowYaml(yaml)
      const workflow = await workflowService.createWorkflow(workflowData)

      return reply.code(201).send({
        success: true,
        data: workflowToJson(workflow),
      })
    } catch (error) {
      if (error.message.includes('YAML') || error.message.includes('is required')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })
}
