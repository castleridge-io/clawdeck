import type { Story } from '@prisma/client'

const VALID_STATUSES = ['pending', 'running', 'completed', 'failed'] as const

export function createStoryService () {
  return {
    /**
     * List stories by run ID
     */
    async listStoriesByRunId (runId: string): Promise<Story[]> {
      const prisma = (await import('../db/prisma.js')).prisma

      return await prisma.story.findMany({
        where: { runId },
        orderBy: { storyIndex: 'asc' },
      })
    },

    /**
     * Get story by ID
     */
    async getStory (id: string): Promise<Story | null> {
      const prisma = (await import('../db/prisma.js')).prisma

      return await prisma.story.findUnique({
        where: { id },
      })
    },

    /**
     * Create a new story
     */
    async createStory (data: {
      runId: string
      storyIndex: number
      storyId: string
      title: string
      description?: string | null
      acceptanceCriteria?: string | null
    }): Promise<Story> {
      const prisma = (await import('../db/prisma.js')).prisma

      // Verify run exists
      const run = await prisma.run.findUnique({
        where: { id: data.runId },
      })

      if (!run) {
        throw new Error('Run not found')
      }

      // Generate story ID
      const id = `story-${Date.now()}-${Math.random().toString(36).substring(7)}`

      return await prisma.story.create({
        data: {
          id,
          runId: data.runId,
          storyIndex: data.storyIndex,
          storyId: data.storyId,
          title: data.title,
          description: data.description ?? null,
          acceptanceCriteria: data.acceptanceCriteria ?? null,
          status: 'pending',
        },
      })
    },

    /**
     * Update story status
     */
    async updateStoryStatus (
      id: string,
      status: string,
      output?: unknown
    ): Promise<Story> {
      const prisma = (await import('../db/prisma.js')).prisma

      const story = await prisma.story.findUnique({
        where: { id },
      })

      if (!story) {
        throw new Error('Story not found')
      }

      if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
        throw new Error(
          `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`
        )
      }

      const updateData: Record<string, unknown> = { status }
      if (output !== undefined) {
        updateData.output = typeof output === 'string' ? output : JSON.stringify(output)
      }

      return await prisma.story.update({
        where: { id },
        data: updateData,
      })
    },

    /**
     * Increment story retry count
     */
    async incrementStoryRetry (id: string): Promise<Story> {
      const prisma = (await import('../db/prisma.js')).prisma

      const story = await prisma.story.findUnique({
        where: { id },
      })

      if (!story) {
        throw new Error('Story not found')
      }

      if (story.retryCount >= story.maxRetries) {
        throw new Error('Maximum retries exceeded')
      }

      return await prisma.story.update({
        where: { id },
        data: {
          retryCount: story.retryCount + 1,
        },
      })
    },
  }
}
