import type { Prisma } from '@prisma/client'
import type { Run, Step, Story, Workflow } from '@prisma/client'

const VALID_STATUSES = ['pending', 'running', 'completed', 'failed', 'awaiting_approval'] as const
type WorkflowData = {
  name: string
  description?: string
  steps?: Array<{
    step_id?: string
    agent_id?: string
    input_template?: string
    expects?: string
    type?: string
    loop_config?: unknown
    position?: number
  }>
}

interface StepData {
  step_id?: string
  agent_id?: string
  input_template?: string
  expects?: string
  type?: string
  loop_config?: unknown
  position?: number
}

/**
 * Parse workflow YAML and return workflow data
 * @param {string} yamlString - YAML string to parse
 * @returns {Object} Workflow data object
 */
export function parseWorkflowYaml(yamlString: string): WorkflowData {
  if (!yamlString || typeof yamlString !== 'string') {
    throw new Error('YAML string is required')
  }

  let parsed: unknown

  try {
    parsed = yaml.parse(yamlString)
  } catch (error) {
    throw new Error(`YAML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('YAML must parse to an object')
  }

  // Validate required fields
  if (!parsed.name) {
    throw new Error('name is required in YAML')
  }

  // Extract workflow data
  const workflowData: WorkflowData = {
    name: parsed.name,
    description: parsed.description || null,
    steps: [],
  }

  // Parse steps
  if (parsed.steps && Array.isArray(parsed.steps)) {
    workflowData.steps = parsed.steps.map((step: unknown, index: number) => {
      if (!step.step_id && !step.agentId) {
        throw new Error(`Step at index ${index} is missing step_id`)
      }

      if (!step.input_template && !step.expects) {
        throw new Error(`Step at index ${index} is missing input_template`)
      }

      return {
        step_id: step.step_id || step.stepId,
        agent_id: step.agent_id || step.agentId,
        input_template: step.input_template || step.inputTemplate,
        expects: step.expects || step.expects,
        type: step.type || 'single',
        loop_config: step.loop_config || step.loopConfig,
        position: step.position ?? index,
      }
    })
  }

  return workflowData
}

/**
 * Example YAML format:
 *
 * name: feature-development
 * description: Design, implement, and review a new feature
 * steps:
 *   - step_id: design
 *     agent_id: architect
 *     input_template: |
 *       Design following feature:
 *       {{task}}
 *     expects: design_document
 *     type: single
 *   - step_id: implement
 *     agent_id: developer
 *     input_template: |
 *       Implement following design:
 *       {{design_document}}
 *     expects: implementation
 *     type: single
 *   - step_id: review
 *     agent_id: reviewer
 *     input_template: |
 *       Review following implementation:
 *       {{implementation}}
 *     expects: approval
 *     type: approval
 */
