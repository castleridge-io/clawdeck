import { authenticateRequest } from '../middleware/auth.js'
import { createStoryService } from '../services/story.service.js'
import { createRunService } from '../services/run.service.js'

// Helper to safely parse JSON (prevents crashes from invalid JSON in DB)
function safeJsonParse(str) {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return str // Return as-is if not valid JSON
  }
}

// Helper function to convert story to JSON response
function storyToJson(story) {
  return {
    id: story.id,
    run_id: story.runId,
    story_index: story.storyIndex,
    story_id: story.storyId,
    title: story.title,
    description: story.description,
    acceptance_criteria: story.acceptanceCriteria,
    status: story.status,
    output: safeJsonParse(story.output),
    retry_count: story.retryCount,
    max_retries: story.maxRetries,
    created_at: story.createdAt.toISOString(),
    updated_at: story.updatedAt.toISOString()
  }
}

export async function storiesRoutes(fastify, opts) {
  const storyService = createStoryService()
  const runService = createRunService()

  // Apply authentication to all routes
  fastify.addHook('onRequest', authenticateRequest)

  // GET /api/v1/runs/:runId/stories - List stories for a run
  fastify.get('/', async (request, reply) => {
    const { runId } = request.params

    const run = await runService.getRun(runId)
    if (!run) {
      return reply.code(404).send({ error: 'Run not found' })
    }

    const stories = await storyService.listStoriesByRunId(runId)

    return {
      success: true,
      data: stories.map(storyToJson)
    }
  })

  // GET /api/v1/runs/:runId/stories/:storyId - Get single story
  fastify.get('/:storyId', async (request, reply) => {
    const { runId, storyId } = request.params

    const story = await storyService.getStory(storyId)

    if (!story || story.runId !== runId) {
      return reply.code(404).send({ error: 'Story not found' })
    }

    return {
      success: true,
      data: storyToJson(story)
    }
  })

  // POST /api/v1/runs/:runId/stories - Create a new story (for loop workflows)
  fastify.post('/', async (request, reply) => {
    const { runId } = request.params
    const { story_index, story_id, title, description, acceptance_criteria } = request.body

    if (!title) {
      return reply.code(400).send({ error: 'title is required' })
    }

    const run = await runService.getRun(runId)
    if (!run) {
      return reply.code(404).send({ error: 'Run not found' })
    }

    // Convert acceptance_criteria to string format
    let acceptanceCriteria = null
    if (acceptance_criteria !== undefined && acceptance_criteria !== null) {
      if (Array.isArray(acceptance_criteria)) {
        acceptanceCriteria = acceptance_criteria.map(c => `- ${c}`).join('\n')
      } else if (typeof acceptance_criteria === 'object') {
        // Convert object to markdown list format
        acceptanceCriteria = Object.entries(acceptance_criteria)
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n')
      } else if (typeof acceptance_criteria === 'string') {
        acceptanceCriteria = acceptance_criteria
      }
    }

    try {
      const story = await storyService.createStory({
        runId,
        storyIndex: story_index,
        storyId: story_id,
        title,
        description,
        acceptanceCriteria
      })

      return reply.code(201).send({
        success: true,
        data: storyToJson(story)
      })
    } catch (error) {
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message })
      }
      throw error
    }
  })

  // POST /api/v1/runs/:runId/stories/:storyId/start - Start working on a story
  fastify.post('/:storyId/start', async (request, reply) => {
    const { runId, storyId } = request.params

    const story = await storyService.getStory(storyId)

    if (!story || story.runId !== runId) {
      return reply.code(404).send({ error: 'Story not found' })
    }

    if (story.status !== 'pending') {
      return reply.code(400).send({
        error: `Story cannot be started. Current status: ${story.status}`,
        current_status: story.status
      })
    }

    try {
      const updatedStory = await storyService.updateStoryStatus(storyId, 'running')

      return {
        success: true,
        data: storyToJson(updatedStory)
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message })
      }
      if (error.message.includes('Invalid status')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // POST /api/v1/runs/:runId/stories/:storyId/complete - Complete a story
  fastify.post('/:storyId/complete', async (request, reply) => {
    const { runId, storyId } = request.params
    const { output } = request.body

    const story = await storyService.getStory(storyId)

    if (!story || story.runId !== runId) {
      return reply.code(404).send({ error: 'Story not found' })
    }

    if (story.status !== 'running') {
      return reply.code(400).send({
        error: `Story cannot be completed. Current status: ${story.status}`,
        current_status: story.status
      })
    }

    try {
      const updatedStory = await storyService.updateStoryStatus(storyId, 'completed', output)

      return {
        success: true,
        data: storyToJson(updatedStory)
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message })
      }
      if (error.message.includes('Invalid status')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })

  // POST /api/v1/runs/:runId/stories/:storyId/fail - Fail a story (with retry)
  fastify.post('/:storyId/fail', async (request, reply) => {
    const { runId, storyId } = request.params
    const { error: errorMessage, output } = request.body

    if (!errorMessage) {
      return reply.code(400).send({ error: 'error message is required' })
    }

    const story = await storyService.getStory(storyId)

    if (!story || story.runId !== runId) {
      return reply.code(404).send({ error: 'Story not found' })
    }

    if (story.status !== 'running') {
      return reply.code(400).send({
        error: `Story cannot be failed. Current status: ${story.status}`,
        current_status: story.status
      })
    }

    try {
      // Check if we can retry
      if (story.retryCount < story.maxRetries) {
        await storyService.incrementStoryRetry(storyId)
        const updatedStory = await storyService.updateStoryStatus(storyId, 'pending', {
          error: errorMessage,
          output,
          retry: story.retryCount + 1
        })

        return {
          success: true,
          data: storyToJson(updatedStory),
          message: `Story failed, will retry (${story.retryCount + 1}/${story.maxRetries})`,
          will_retry: true
        }
      } else {
        // Max retries exceeded, mark as failed
        const updatedStory = await storyService.updateStoryStatus(storyId, 'failed', {
          error: errorMessage,
          output,
          retries_exhausted: true
        })

        return {
          success: true,
          data: storyToJson(updatedStory),
          message: 'Story failed, max retries exceeded',
          will_retry: false
        }
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message })
      }
      throw error
    }
  })

  // PATCH /api/v1/runs/:runId/stories/:storyId - Update story
  fastify.patch('/:storyId', async (request, reply) => {
    const { runId, storyId } = request.params
    const { status, output } = request.body

    if (!status && output === undefined) {
      return reply.code(400).send({ error: 'status or output is required' })
    }

    const story = await storyService.getStory(storyId)

    if (!story || story.runId !== runId) {
      return reply.code(404).send({ error: 'Story not found' })
    }

    try {
      const updatedStory = await storyService.updateStoryStatus(storyId, status || story.status, output)

      return {
        success: true,
        data: storyToJson(updatedStory)
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        return reply.code(404).send({ error: error.message })
      }
      if (error.message.includes('Invalid status')) {
        return reply.code(400).send({ error: error.message })
      }
      throw error
    }
  })
}
