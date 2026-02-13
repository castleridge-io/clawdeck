import * as yaml from 'yaml'

/**
 * Parse workflow YAML and return workflow data
 * @param {string} yamlString - YAML string to parse
 * @returns {Object} Workflow data object
 */
export function parseWorkflowYaml(yamlString) {
  if (!yamlString || typeof yamlString !== 'string') {
    throw new Error('YAML string is required')
  }

  let parsed
  try {
    parsed = yaml.parse(yamlString)
  } catch (error) {
    throw new Error(`YAML parsing failed: ${error.message}`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('YAML must parse to an object')
  }

  // Validate required fields
  if (!parsed.name) {
    throw new Error('name is required in YAML')
  }

  // Extract workflow data
  const workflowData = {
    name: parsed.name,
    description: parsed.description || null,
    steps: []
  }

  // Parse steps
  if (parsed.steps && Array.isArray(parsed.steps)) {
    workflowData.steps = parsed.steps.map((step, index) => {
      if (!step.step_id && !step.stepId) {
        throw new Error(`Step at index ${index} is missing step_id`)
      }
      if (!step.agent_id && !step.agentId) {
        throw new Error(`Step at index ${index} is missing agent_id`)
      }
      if (!step.input_template && !step.inputTemplate) {
        throw new Error(`Step at index ${index} is missing input_template`)
      }
      if (!step.expects) {
        throw new Error(`Step at index ${index} is missing expects`)
      }

      return {
        stepId: step.step_id || step.stepId,
        name: step.name || null,
        agentId: step.agent_id || step.agentId,
        inputTemplate: step.input_template || step.inputTemplate,
        expects: step.expects,
        type: step.type || 'single',
        loopConfig: step.loop_config || step.loopConfig || null,
        position: step.position ?? index
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
 *     name: Design Phase
 *     agent_id: architect
 *     input_template: |
 *       Design the following feature:
 *       {{task}}
 *     expects: design_document
 *     type: single
 *   - step_id: implement
 *     name: Implementation Phase
 *     agent_id: developer
 *     input_template: |
 *       Implement the following design:
 *       {{design_document}}
 *     expects: implementation
 *     type: single
 *   - step_id: review
 *     name: Code Review
 *     agent_id: reviewer
 *     input_template: |
 *       Review the following implementation:
 *       {{implementation}}
 *     expects: approval
 *     type: approval
 */
