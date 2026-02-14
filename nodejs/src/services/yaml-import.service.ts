import type { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'
import type { Prisma } from '@prisma/client'

export function parseWorkflowYaml(yamlString: string): WorkflowData {
  if (!yamlString || typeof yamlString !== 'string') {
    throw new Error('YAML string is required')
  }

  let parsed: unknown

  try {
    parsed = yaml.parse(yamlString)
  } catch {
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
        step_id: step.step_id || step.agentId,
        name: step.name || null,
        agent_id: step.agent_id || null,
        input_template: step.input_template || null,
        expects: step.expects || null,
        type: step.type || 'single',
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
