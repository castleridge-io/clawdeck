import yaml from 'yaml'

export function parseWorkflowYaml (yamlString: string): WorkflowData {
  if (!yamlString || typeof yamlString !== 'string') {
    throw new Error('YAML string is required')
  }

  let parsed: Record<string, unknown>

  try {
    parsed = yaml.parse(yamlString) as Record<string, unknown>
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
    name: parsed.name as string,
    description: (parsed.description as string) || null,
    steps: [],
  }

  // Parse steps
  if (parsed.steps && Array.isArray(parsed.steps)) {
    workflowData.steps = parsed.steps.map((step: Record<string, unknown>, index: number) => {
      if (!step.step_id && !step.agentId) {
        throw new Error(`Step at index ${index} is missing step_id`)
      }

      if (!step.input_template && !step.expects) {
        throw new Error(`Step at index ${index} is missing input_template`)
      }

      return {
        step_id: (step.step_id || step.agentId) as string,
        name: (step.name as string) || null,
        agent_id: (step.agent_id as string) ?? undefined,
        input_template: (step.input_template as string) ?? undefined,
        expects: (step.expects as string) ?? undefined,
        type: (step.type as string) || 'single',
        position: index,
      }
    })
  }

  return workflowData
}

export interface WorkflowData {
  name: string
  description: string | null
  steps: WorkflowStepData[]
}

export interface WorkflowStepData {
  step_id?: string
  agent_id?: string
  input_template?: string
  expects?: string
  type?: string
  name: string | null
  position: number
}
