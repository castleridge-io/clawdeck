import { prisma } from '../db/prisma.js'

const VALID_STATUSES = ['pending', 'running', 'completed', 'failed']

/**
 * Create story service
 */
export function createStoryService () {
  return {
    /**
     * Create a new story
     */
    async createStory (data) {
      const {
        runId,
        storyIndex,
        storyId,
        title,
        description,
        acceptanceCriteria,
        maxRetries = 3,
      } = data

      // Verify run exists
      const run = await prisma.run.findUnique({
        where: { id: runId },
      })

      if (!run) {
        throw new Error('Run not found')
      }

      // Generate story ID
      const id = `story-${Date.now()}-${Math.random().toString(36).substring(7)}`

      return await prisma.story.create({
        data: {
          id,
          runId,
          storyIndex,
          storyId,
          title,
          description,
          acceptanceCriteria,
          maxRetries,
        },
      })
    },

    /**
     * Get story by ID
     */
    async getStory (id) {
      return await prisma.story.findUnique({
        where: { id },
      })
    },

    /**
     * List stories by run ID
     */
    async listStoriesByRunId (runId) {
      return await prisma.story.findMany({
        where: { runId },
        orderBy: { storyIndex: 'asc' },
      })
    },

    /**
     * Update story status
     */
    async updateStoryStatus (id, status, output = null) {
      if (!VALID_STATUSES.includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`)
      }

      const story = await prisma.story.findUnique({
        where: { id },
      })

      if (!story) {
        throw new Error('Story not found')
      }

      const updateData = { status }

      if (output !== null) {
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
    async incrementStoryRetry (id) {
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
