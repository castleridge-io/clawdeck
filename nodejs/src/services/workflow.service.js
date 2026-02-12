import { prisma } from '../db/prisma.js'

const VALID_STEP_TYPES = ['single', 'loop', 'approval']
const VALID_STATUSES = ['waiting', 'running', 'completed', 'failed', 'awaiting_approval']

/**
 * Validate workflow step configuration
 */
function validateStep(step) {
  if (!step.stepId) {
    throw new Error('stepId is required')
  }
  if (!step.agentId) {
    throw new Error('agentId is required')
  }
  if (!step.inputTemplate) {
    throw new Error('inputTemplate is required')
  }
  if (!step.expects) {
    throw new Error('expects is required')
  }
  if (step.type && !VALID_STEP_TYPES.includes(step.type)) {
    throw new Error(`Invalid step type: ${step.type}. Must be one of: ${VALID_STEP_TYPES.join(', ')}`)
  }
}

/**
 * Create workflow service
 */
export function createWorkflowService() {
  return {
    /**
     * Create a new workflow
     */
    async createWorkflow(data) {
      const { name, description, steps = [] } = data

      if (!name) {
        throw new Error('name is required')
      }

      if (!Array.isArray(steps)) {
        throw new Error('steps must be an array')
      }

      // Validate each step
      for (const step of steps) {
        validateStep(step)
      }

      const config = { steps }

      return await prisma.workflow.create({
        data: {
          name,
          description,
          config
        }
      })
    },

    /**
     * Get workflow by ID
     */
    async getWorkflow(id) {
      return await prisma.workflow.findUnique({
        where: { id: BigInt(id) }
      })
    },

    /**
     * Get workflow by name
     */
    async getWorkflowByName(name) {
      return await prisma.workflow.findUnique({
        where: { name }
      })
    },

    /**
     * List all workflows
     */
    async listWorkflows(filters = {}) {
      const where = {}

      if (filters.name) {
        where.name = filters.name
      }

      return await prisma.workflow.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      })
    },

    /**
     * Delete workflow by ID
     */
    async deleteWorkflow(id) {
      // Check if workflow has active runs
      const runCount = await prisma.run.count({
        where: {
          workflowId: BigInt(id),
          status: 'running'
        }
      })

      if (runCount > 0) {
        throw new Error('Cannot delete workflow with active runs')
      }

      await prisma.workflow.delete({
        where: { id: BigInt(id) }
      })
    }
  }
}
