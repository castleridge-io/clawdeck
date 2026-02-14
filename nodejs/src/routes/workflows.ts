import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { authenticateRequest } from '../middleware/auth.js'
import { createWorkflowService, type FormattedWorkflow, type StepConfig } from '../services/workflow.service.js'
import { parseWorkflowYaml, type WorkflowData } from '../services/yaml-import.service.js'

interface StepJson {
  id: string
  step_id: string
  name: string | null
  agent_id: string
  input_template: string
  expects: string
  type: string
  loop_config: Record<string, unknown> | null
  position: number
}

interface WorkflowJson {
  id: string
  name: string
  description: string | null
  steps: StepJson[]
  created_at: string
  updated_at: string
}

// Helper function to convert workflow to JSON response
function workflowToJson(workflow: FormattedWorkflow | null): WorkflowJson | null {
  if (!workflow) return null
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    steps: workflow.steps.map(step => ({
      id: step.id,
      step_id: step.stepId,
      name: step.name,
      agent_id: step.agentId,
      input_template: step.inputTemplate,
      expects: step.expects,
      type: step.type,
      loop_config: step.loopConfig,
      position: step.position,
    })),
    created_at: workflow.createdAt.toISOString(),
    updated_at: workflow.updatedAt.toISOString(),
  }
}

// Helper to convert WorkflowData steps to StepConfig
function toStepConfig(steps: WorkflowData['steps']): StepConfig[] {
  if (!steps) return []
  return steps.map(step => ({
    stepId: step.step_id ?? '',
    name: step.name,
    agentId: step.agent_id ?? '',
    inputTemplate: step.input_template ?? '',
    expects: step.expects ?? '',
    type: (step.type ?? 'single') as 'single' | 'loop' | 'approval',
    position: step.position,
  }))
}

export async function workflowsRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const workflowService = createWorkflowService()

  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/workflows - List workflows
  fastify.get('/', async (request, reply) => {
    const query = request.query as { name?: string }
    const { name } = query

    const filters: Record<string, unknown> = {}
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
    const params = request.params as { id: string }
    const workflow = await workflowService.getWorkflow(params.id)

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
    const body = request.body as {
      name?: string
      description?: string
      steps?: StepConfig[]
    }
    const { name, description, steps } = body

    try {
      const workflow = await workflowService.createWorkflow({
        name: name ?? '',
        description,
        steps,
      })

      return reply.code(201).send({
        success: true,
        data: workflowToJson(workflow),
      })
    } catch (error) {
      if (error instanceof Error && (error.message.includes('is required') || error.message.includes('must be an array'))) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // PATCH /api/v1/workflows/:id - Update workflow
  fastify.patch('/:id', async (request, reply) => {
    const params = request.params as { id: string }
    const body = request.body as {
      name?: string
      description?: string
      steps?: StepConfig[]
    }
    const { name, description, steps } = body

    try {
      const workflow = await workflowService.updateWorkflow(params.id, {
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
      if (error instanceof Error && (error.message.includes('is required') || error.message.includes('must be an array'))) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // DELETE /api/v1/workflows/:id - Delete workflow
  fastify.delete('/:id', async (request, reply) => {
    const params = request.params as { id: string }
    try {
      await workflowService.deleteWorkflow(params.id)
      return reply.code(204).send()
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message })
      }
      if (error instanceof Error && error.message.includes('Cannot delete')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // POST /api/v1/workflows/import-yaml - Import workflow from YAML
  fastify.post('/import-yaml', async (request, reply) => {
    const { yaml } = request.body as { yaml?: string }

    if (!yaml) {
      return reply.code(400).send({ error: 'yaml is required' })
    }

    try {
      const workflowData = parseWorkflowYaml(yaml)
      const workflow = await workflowService.createWorkflow({
        name: workflowData.name,
        description: workflowData.description,
        steps: toStepConfig(workflowData.steps),
      })

      return reply.code(201).send({
        success: true,
        data: workflowToJson(workflow),
      })
    } catch (error) {
      if (error instanceof Error && (error.message.includes('YAML') || error.message.includes('is required'))) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })
}
