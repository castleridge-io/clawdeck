import { prisma } from '../db/prisma.js'
import type { Workflow, WorkflowStep, Prisma } from '@prisma/client'

const VALID_STEP_TYPES = ['single', 'loop', 'approval'] as const
type StepType = typeof VALID_STEP_TYPES[number]

const VALID_STATUSES = ['waiting', 'running', 'completed', 'failed', 'awaiting_approval'] as const
type StepStatus = typeof VALID_STATUSES[number]

export interface StepConfig {
  stepId: string
  name?: string | null
  agentId: string
  inputTemplate: string
  expects: string
  type?: StepType
  loopConfig?: Record<string, unknown> | null
  position?: number
}

export interface CreateWorkflowData {
  name: string
  description?: string | null
  steps?: StepConfig[]
}

export interface UpdateWorkflowData {
  name?: string
  description?: string | null
  steps?: StepConfig[]
}

export interface ListWorkflowFilters {
  name?: string
}

export interface FormattedStep {
  id: string
  stepId: string
  name: string | null
  agentId: string
  inputTemplate: string
  expects: string
  type: string
  loopConfig: Record<string, unknown> | null
  position: number
}

export interface FormattedWorkflow {
  id: string
  name: string
  description: string | null
  steps: FormattedStep[]
  createdAt: Date
  updatedAt: Date
}

export interface WorkflowWithConfig {
  id: string
  name: string
  description: string | null
  config: { steps: StepConfig[] }
  createdAt: Date
  updatedAt: Date
}

interface WorkflowWithSteps extends Workflow {
  steps: WorkflowStep[]
}

/**
 * Validate workflow step configuration
 */
function validateStep (step: StepConfig): void {
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
    throw new Error(
      `Invalid step type: ${step.type}. Must be one of: ${VALID_STEP_TYPES.join(', ')}`
    )
  }
}

/**
 * Format workflow for API response (includes steps from WorkflowStep table)
 */
async function formatWorkflowResponse (workflow: Workflow | null): Promise<FormattedWorkflow | null> {
  if (!workflow) return null

  const steps = await prisma.workflowStep.findMany({
    where: { workflowId: workflow.id },
    orderBy: { position: 'asc' },
  })

  return {
    id: workflow.id.toString(),
    name: workflow.name,
    description: workflow.description,
    steps: steps.map((step) => ({
      id: step.id.toString(),
      stepId: step.stepId,
      name: step.name,
      agentId: step.agentId,
      inputTemplate: step.inputTemplate,
      expects: step.expects,
      type: step.type,
      loopConfig: step.loopConfig as Record<string, unknown> | null,
      position: step.position,
    })),
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  }
}

/**
 * Create workflow service
 */
export function createWorkflowService () {
  return {
    /**
     * Create a new workflow
     */
    async createWorkflow (data: CreateWorkflowData): Promise<FormattedWorkflow> {
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

      const workflow = await prisma.workflow.create({
        data: {
          name,
          description,
          config: {}, // Keep config for backwards compatibility
        },
      })

      // Create workflow steps
      if (steps.length > 0) {
        await prisma.workflowStep.createMany({
          data: steps.map((step, index): Prisma.WorkflowStepCreateManyInput => ({
            workflowId: workflow.id,
            stepId: step.stepId,
            name: step.name ?? null,
            agentId: step.agentId,
            inputTemplate: step.inputTemplate,
            expects: step.expects,
            type: step.type ?? 'single',
            loopConfig: step.loopConfig ? JSON.parse(JSON.stringify(step.loopConfig)) : null,
            position: step.position ?? index,
          })),
        })
      }

      return (await formatWorkflowResponse(workflow)) as FormattedWorkflow
    },

    /**
     * Get workflow by ID
     */
    async getWorkflow (id: string | bigint): Promise<FormattedWorkflow | null> {
      const workflow = await prisma.workflow.findUnique({
        where: { id: BigInt(id) },
      })
      return formatWorkflowResponse(workflow)
    },

    /**
     * Get workflow by name
     */
    async getWorkflowByName (name: string): Promise<FormattedWorkflow | null> {
      const workflow = await prisma.workflow.findUnique({
        where: { name },
      })
      return formatWorkflowResponse(workflow)
    },

    /**
     * List all workflows
     */
    async listWorkflows (filters: ListWorkflowFilters = {}): Promise<FormattedWorkflow[]> {
      const where: Prisma.WorkflowWhereInput = {}

      if (filters.name) {
        where.name = filters.name
      }

      const workflows = await prisma.workflow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      const results: FormattedWorkflow[] = []
      for (const workflow of workflows) {
        const formatted = await formatWorkflowResponse(workflow)
        if (formatted) {
          results.push(formatted)
        }
      }
      return results
    },

    /**
     * Update workflow by ID
     */
    async updateWorkflow (id: string | bigint, data: UpdateWorkflowData): Promise<FormattedWorkflow | null> {
      const { name, description, steps } = data

      const updateData: Prisma.WorkflowUpdateInput = {}
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description

      // Update workflow fields
      if (Object.keys(updateData).length > 0) {
        await prisma.workflow.update({
          where: { id: BigInt(id) },
          data: updateData,
        })
      }

      // Update steps if provided
      if (steps !== undefined) {
        if (!Array.isArray(steps)) {
          throw new Error('steps must be an array')
        }

        // Validate each step
        for (const step of steps) {
          validateStep(step)
        }

        // Delete existing steps
        await prisma.workflowStep.deleteMany({
          where: { workflowId: BigInt(id) },
        })

        // Create new steps
        if (steps.length > 0) {
          await prisma.workflowStep.createMany({
            data: steps.map((step, index): Prisma.WorkflowStepCreateManyInput => ({
              workflowId: BigInt(id),
              stepId: step.stepId,
              name: step.name ?? null,
              agentId: step.agentId,
              inputTemplate: step.inputTemplate,
              expects: step.expects,
              type: step.type ?? 'single',
              loopConfig: step.loopConfig ? JSON.parse(JSON.stringify(step.loopConfig)) : null,
              position: step.position ?? index,
            })),
          })
        }
      }

      return this.getWorkflow(id)
    },

    /**
     * Delete workflow by ID
     */
    async deleteWorkflow (id: string | bigint): Promise<void> {
      // Check if workflow has active runs
      const runCount = await prisma.run.count({
        where: {
          workflowId: BigInt(id),
          status: 'running',
        },
      })

      if (runCount > 0) {
        throw new Error('Cannot delete workflow with active runs')
      }

      // Delete steps first (cascade should handle this, but be explicit)
      await prisma.workflowStep.deleteMany({
        where: { workflowId: BigInt(id) },
      })

      await prisma.workflow.delete({
        where: { id: BigInt(id) },
      })
    },

    /**
     * Get raw workflow with config (for workflow execution)
     */
    async getWorkflowWithConfig (id: string | bigint): Promise<WorkflowWithConfig | null> {
      const workflow = await prisma.workflow.findUnique({
        where: { id: BigInt(id) },
        include: {
          steps: {
            orderBy: { position: 'asc' },
          },
        },
      })

      if (!workflow) return null

      const typedWorkflow = workflow as WorkflowWithSteps

      // Build config from steps for backwards compatibility with runner
      const stepsConfig: StepConfig[] = typedWorkflow.steps.map((step) => ({
        stepId: step.stepId,
        name: step.name,
        agentId: step.agentId,
        inputTemplate: step.inputTemplate,
        expects: step.expects,
        type: step.type as StepType,
        loopConfig: step.loopConfig as Record<string, unknown> | null,
      }))

      return {
        id: typedWorkflow.id.toString(),
        name: typedWorkflow.name,
        description: typedWorkflow.description,
        config: { steps: stepsConfig },
        createdAt: typedWorkflow.createdAt,
        updatedAt: typedWorkflow.updatedAt,
      }
    },
  }
}

export type { StepType, StepStatus }
