/**
 * Workflow Executor Service
 *
 * Provides the "intelligence layer" for workflow execution:
 * - Template resolution ({{variable}} replacement)
 * - Context merging from agent output
 * - STORIES_JSON parsing
 * - Story formatting for templates
 * - Step claiming by agent
 * - Pipeline advancement
 *
 * Ported from antfarm/src/installer/step-ops.ts
 */

import { prisma as defaultPrisma } from '../db/prisma.js'

interface Story {
  id?: string
  storyId: string
  title: string
  description?: string
  acceptanceCriteria?: string[]
  status?: string
}

interface LoopConfig {
  over: 'stories'
  completion: 'all_done'
  freshSession?: boolean
  verifyEach?: boolean
  verifyStep?: string
}

interface StepWithRun {
  id: string
  runId: string
  stepId: string
  agentId: string
  inputTemplate: string
  expects: string
  status: string
  type: string
  loopConfig: LoopConfig | null
  run: {
    id: string
    context: string
    status: string
  }
}

interface PrismaClient {
  step: {
    findFirst: (args: { where: Record<string, unknown>; include?: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<StepWithRun | null>
    findMany: (args: { where: Record<string, unknown> }) => Promise<StepWithRun[]>
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>
  }
  run: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{ id: string; context: string } | null>
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>
  }
  story: {
    findFirst: (args: { where: Record<string, unknown>; orderBy: Record<string, unknown> }) => Promise<{ id: string; storyId: string; title: string; description: string; acceptanceCriteria: string; status: string } | null>
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>
  }
}

export function createWorkflowExecutorService(options?: { prisma?: PrismaClient }) {
  const prisma = (options?.prisma ?? defaultPrisma) as PrismaClient

  return {
    /**
     * Resolve {{variable}} placeholders in a template against a context object.
     * Case-insensitive matching. Missing variables return [missing: key].
     *
     * @param template - String with {{variable}} placeholders
     * @param context - Object with variable values
     * @returns Resolved template string
     */
    resolveTemplate(template: string, context: Record<string, string>): string {
      return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
        // Try exact match first
        if (key in context) {
          return context[key]
        }
        // Try case-insensitive match
        const lower = key.toLowerCase()
        for (const contextKey of Object.keys(context)) {
          if (contextKey.toLowerCase() === lower) {
            return context[contextKey]
          }
        }
        // Not found
        return `[missing: ${key}]`
      })
    },

    /**
     * Merge KEY: value lines from agent output into run context.
     * Excludes STORIES_JSON from being merged into context.
     *
     * @param output - Agent output string
     * @param existingContext - Current run context
     * @returns New context object with merged values
     */
    mergeContextFromOutput(
      output: string,
      existingContext: Record<string, string>
    ): Record<string, string> {
      const newContext = { ...existingContext }

      for (const line of output.split('\n')) {
        const match = line.match(/^([A-Z_]+):\s*(.+)$/)
        if (match) {
          const key = match[1]
          const value = match[2].trim()
          // Don't merge STORIES_JSON into context
          if (key !== 'STORIES_JSON') {
            newContext[key.toLowerCase()] = value
          }
        }
      }

      return newContext
    },

    /**
     * Parse STORIES_JSON from agent output (typically planner output).
     * Supports both camelCase and snake_case field names.
     * Max 20 stories allowed.
     *
     * @param output - Agent output containing STORIES_JSON
     * @returns Array of parsed story objects
     * @throws Error if JSON is invalid or stories exceed limit
     */
    parseStoriesJson(output: string): Story[] {
      const lines = output.split('\n')
      const startIdx = lines.findIndex(l => l.startsWith('STORIES_JSON:'))

      if (startIdx === -1) {
        return []
      }

      // Collect JSON text: first line after prefix, then subsequent lines until next KEY: or end
      const firstLine = lines[startIdx].slice('STORIES_JSON:'.length).trim()
      const jsonLines = [firstLine]

      for (let i = startIdx + 1; i < lines.length; i++) {
        if (/^[A-Z_]+:\s/.test(lines[i])) break
        jsonLines.push(lines[i])
      }

      const jsonText = jsonLines.join('\n').trim()

      let rawStories: Record<string, unknown>[]
      try {
        rawStories = JSON.parse(jsonText)
      } catch (e) {
        throw new Error(`Failed to parse STORIES_JSON: ${(e as Error).message}`)
      }

      if (!Array.isArray(rawStories)) {
        throw new Error('STORIES_JSON must be an array')
      }

      if (rawStories.length > 20) {
        throw new Error(`STORIES_JSON has ${rawStories.length} stories, max is 20`)
      }

      // Normalize stories to camelCase
      const seenIds = new Set<string>()
      const stories: Story[] = []

      for (let i = 0; i < rawStories.length; i++) {
        const s = rawStories[i]

        // Accept both camelCase and snake_case
        const acceptanceCriteria = s.acceptanceCriteria ?? s.acceptance_criteria

        if (!s.id || !s.title || !s.description || !Array.isArray(acceptanceCriteria)) {
          throw new Error(
            `STORIES_JSON story at index ${i} missing required fields (id, title, description, acceptanceCriteria)`
          )
        }

        if (seenIds.has(s.id as string)) {
          throw new Error(`STORIES_JSON has duplicate story id "${s.id}"`)
        }
        seenIds.add(s.id as string)

        stories.push({
          id: s.id as string,
          storyId: s.id as string,
          title: s.title as string,
          description: s.description as string,
          acceptanceCriteria: acceptanceCriteria as string[],
        })
      }

      return stories
    },

    /**
     * Format a story object for template injection.
     * Includes title, description, and numbered acceptance criteria.
     *
     * @param story - Story object to format
     * @returns Formatted string for template
     */
    formatStoryForTemplate(story: Story): string {
      const ac = (story.acceptanceCriteria ?? [])
        .map((c, i) => `  ${i + 1}. ${c}`)
        .join('\n')

      return `Story ${story.storyId}: ${story.title}\n\n${story.description ?? ''}\n\nAcceptance Criteria:\n${ac}`
    },

    /**
     * Format list of completed stories for template injection.
     * Only includes stories with status 'done' or 'completed'.
     *
     * @param stories - Array of story objects
     * @returns Formatted string or "(none yet)"
     */
    formatCompletedStories(stories: Story[]): string {
      const done = stories.filter(s => s.status === 'done' || s.status === 'completed')

      if (done.length === 0) {
        return '(none yet)'
      }

      return done.map(s => `- ${s.storyId}: ${s.title}`).join('\n')
    },

    // ========================================
    // DB-Dependent Functions
    // ========================================

    /**
     * Find and claim a pending step for a specific agent.
     * Handles single steps, loop steps (with story iteration), and approval steps.
     *
     * @param agentId - Agent identifier (e.g., 'feature-dev/planner')
     * @returns Claim result with resolved input or { found: false }
     */
    async claimStepByAgent(agentId: string): Promise<{
      found: boolean
      stepId?: string
      runId?: string
      resolvedInput?: string
      storyId?: string
    }> {
      // Find pending step for this agent with running run
      const step = await prisma.step.findFirst({
        where: {
          agentId,
          status: 'pending',
          run: { status: 'running' },
        },
        include: { run: true },
      })

      if (!step) {
        return { found: false }
      }

      // Parse run context
      const context: Record<string, string> = JSON.parse(step.run.context || '{}')

      // Handle loop steps
      if (step.type === 'loop') {
        // Find next pending story
        const story = await prisma.story.findFirst({
          where: {
            runId: step.runId,
            status: 'pending',
          },
          orderBy: { storyId: 'asc' },
        })

        if (!story) {
          return { found: false }
        }

        // Claim the story
        await prisma.story.update({
          where: { id: story.id },
          data: { status: 'running' },
        })

        // Parse acceptance criteria - can be JSON array or dash-prefixed string
        let acceptanceCriteria: string[] = []
        if (story.acceptanceCriteria) {
          try {
            const parsed = JSON.parse(story.acceptanceCriteria)
            acceptanceCriteria = Array.isArray(parsed) ? parsed : []
          } catch {
            // If not JSON, treat as dash-prefixed string format
            acceptanceCriteria = story.acceptanceCriteria
              .split('\n')
              .map(line => line.trim())
              .filter(line => line.startsWith('-'))
              .map(line => line.substring(1).trim())
          }
        }

        // Build story context
        const storyContext = this.formatStoryForTemplate({
          storyId: story.storyId,
          title: story.title,
          description: story.description,
          acceptanceCriteria,
        })

        // Merge story into context
        const fullContext = {
          ...context,
          current_story: storyContext,
          current_story_id: story.storyId,
        }

        const resolvedInput = this.resolveTemplate(step.inputTemplate, fullContext)

        // Update step with current story
        await prisma.step.update({
          where: { id: step.id },
          data: {
            status: 'running',
            currentStoryId: story.id,
          },
        })

        return {
          found: true,
          stepId: step.id,
          runId: step.runId,
          resolvedInput,
          storyId: story.id,
        }
      }

      // Single step - claim it
      const resolvedInput = this.resolveTemplate(step.inputTemplate, context)

      await prisma.step.update({
        where: { id: step.id },
        data: { status: 'running' },
      })

      return {
        found: true,
        stepId: step.id,
        runId: step.runId,
        resolvedInput,
      }
    },

    /**
     * Advance the pipeline by setting the next waiting step to pending.
     * If no waiting steps remain, mark the run as completed.
     *
     * @param runId - Run ID to advance
     * @returns { advanced: boolean, runCompleted: boolean }
     */
    async advancePipeline(runId: string): Promise<{
      advanced: boolean
      runCompleted: boolean
    }> {
      // Find the next waiting step
      const waitingStep = await prisma.step.findFirst({
        where: {
          runId,
          status: 'waiting',
        },
        orderBy: { stepIndex: 'asc' },
      })

      if (waitingStep) {
        // Advance to pending
        await prisma.step.update({
          where: { id: (waitingStep as { id: string }).id },
          data: { status: 'pending' },
        })

        return { advanced: true, runCompleted: false }
      }

      // No more waiting steps - mark run completed
      await prisma.run.update({
        where: { id: runId },
        data: { status: 'completed' },
      })

      return { advanced: false, runCompleted: true }
    },

    /**
     * Complete a step with context merging and pipeline advancement.
     *
     * @param stepId - Step ID to complete
     * @param output - Agent output string
     * @returns Completion result
     */
    async completeStepWithPipeline(stepId: string, output: string): Promise<{
      stepCompleted: boolean
      runCompleted: boolean
    }> {
      // Get step with run
      const step = await prisma.step.findFirst({
        where: { id: stepId },
        include: { run: true },
      })

      if (!step) {
        throw new Error(`Step not found: ${stepId}`)
      }

      // Merge context from output
      const currentContext: Record<string, string> = JSON.parse(step.run.context || '{}')
      const newContext = this.mergeContextFromOutput(output, currentContext)

      // Update run context
      await prisma.run.update({
        where: { id: step.runId },
        data: { context: JSON.stringify(newContext) },
      })

      // Mark step completed
      await prisma.step.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          output,
        },
      })

      // Advance pipeline
      const advanceResult = await this.advancePipeline(step.runId)

      return {
        stepCompleted: true,
        runCompleted: advanceResult.runCompleted,
      }
    },

    /**
     * Complete a loop story with optional verify_each flow.
     * If verify_each is enabled, sets story to 'verifying' and triggers verify step.
     * Otherwise, marks story as completed directly.
     *
     * @param stepId - Loop step ID
     * @param output - Agent output for the story
     * @returns Completion result with verify status
     */
    async completeLoopStoryWithVerify(stepId: string, output: string): Promise<{
      storyCompleted: boolean
      needsVerify: boolean
      verifyStepId?: string
    }> {
      // Get the loop step
      const step = await prisma.step.findFirst({
        where: { id: stepId },
        include: { run: true },
      })

      if (!step) {
        throw new Error(`Step not found: ${stepId}`)
      }

      const loopConfig = step.loopConfig as LoopConfig | null
      const storyId = step.currentStoryId

      if (!storyId) {
        throw new Error('No current story set on loop step')
      }

      // Check if verify_each is enabled
      if (loopConfig?.verifyEach && loopConfig.verifyStep) {
        // Find the verify step
        const verifyStep = await prisma.step.findFirst({
          where: {
            runId: step.runId,
            stepId: loopConfig.verifyStep,
          },
        })

        if (verifyStep) {
          // Set story to verifying status
          await prisma.story.update({
            where: { id: storyId },
            data: { status: 'verifying', output },
          })

          // Set verify step to pending
          await prisma.step.update({
            where: { id: verifyStep.id },
            data: { status: 'pending', currentStoryId: storyId },
          })

          // Reset loop step to waiting (will be triggered again after verify)
          await prisma.step.update({
            where: { id: stepId },
            data: { status: 'waiting', currentStoryId: null },
          })

          return {
            storyCompleted: false,
            needsVerify: true,
            verifyStepId: verifyStep.id,
          }
        }
      }

      // No verify - mark story as completed directly
      await prisma.story.update({
        where: { id: storyId },
        data: { status: 'completed', output },
      })

      // Clear current story from loop step
      await prisma.step.update({
        where: { id: stepId },
        data: { currentStoryId: null },
      })

      return {
        storyCompleted: true,
        needsVerify: false,
      }
    },

    /**
     * Approve an awaiting_approval step and advance pipeline.
     *
     * @param stepId - Step ID to approve
     * @param approvalNote - Optional approval message
     * @returns Approval result
     */
    async approveStep(stepId: string, approvalNote: string): Promise<{
      approved: boolean
      step: { id: string; status: string }
    }> {
      const step = await prisma.step.findFirst({
        where: { id: stepId },
        include: { run: true },
      })

      if (!step) {
        throw new Error(`Step not found: ${stepId}`)
      }

      if (step.status !== 'awaiting_approval') {
        throw new Error(`Step ${stepId} is not awaiting approval (status: ${step.status})`)
      }

      // Mark step as completed
      const updatedStep = await prisma.step.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          output: `APPROVED: ${approvalNote}`,
        },
      })

      // Advance pipeline
      await this.advancePipeline(step.runId)

      return {
        approved: true,
        step: { id: updatedStep.id, status: updatedStep.status },
      }
    },

    /**
     * Reject an awaiting_approval step with reason.
     *
     * @param stepId - Step ID to reject
     * @param rejectionReason - Reason for rejection
     * @returns Rejection result
     */
    async rejectStep(stepId: string, rejectionReason: string): Promise<{
      rejected: boolean
      step: { id: string; status: string }
    }> {
      const step = await prisma.step.findFirst({
        where: { id: stepId },
        include: { run: true },
      })

      if (!step) {
        throw new Error(`Step not found: ${stepId}`)
      }

      if (step.status !== 'awaiting_approval') {
        throw new Error(`Step ${stepId} is not awaiting approval (status: ${step.status})`)
      }

      // Mark step as failed
      const updatedStep = await prisma.step.update({
        where: { id: stepId },
        data: {
          status: 'failed',
          output: `REJECTED: ${rejectionReason}`,
        },
      })

      return {
        rejected: true,
        step: { id: updatedStep.id, status: updatedStep.status },
      }
    },

    /**
     * Clean up steps that have been stuck in 'running' status for too long.
     * Resets them to 'pending' so they can be claimed again.
     *
     * @param maxAgeMinutes - Maximum age in minutes before considering abandoned (default: 15)
     * @returns Number of steps cleaned up
     */
    async cleanupAbandonedSteps(maxAgeMinutes: number = 15): Promise<{
      cleanedCount: number
    }> {
      const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

      // Find abandoned steps
      const abandonedSteps = await prisma.step.findMany({
        where: {
          status: 'running',
          updatedAt: { lt: cutoffTime },
        },
      })

      // Reset each abandoned step to pending
      for (const step of abandonedSteps) {
        await prisma.step.update({
          where: { id: step.id },
          data: {
            status: 'pending',
            output: `RESET: Step was abandoned (stuck for >${maxAgeMinutes} min)`,
          },
        })
      }

      return {
        cleanedCount: abandonedSteps.length,
      }
    },
  }
}

export type WorkflowExecutorService = ReturnType<typeof createWorkflowExecutorService>
