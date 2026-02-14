import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { createStorageService } from '../services/storage.service.js'

const MAX_AVATAR_SIZE = 512 * 1024
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export async function avatarRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const storageService = createStorageService()

  fastify.post(
    '/upload',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const data = await request.file()

        if (!data) {
          return reply.code(400).send({ error: 'No file uploaded' })
        }

        const contentType = data.mimetype

        if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
          return reply.code(400).send({ error: 'Invalid file type. Must be JPEG, PNG, or WebP' })
        }

        const buffer = await data.toBuffer()

        if (buffer.length > MAX_AVATAR_SIZE) {
          return reply
            .code(400)
            .send({ error: `File too large. Maximum size is ${MAX_AVATAR_SIZE / 1024}KB` })
        }

        const { url, key } = await storageService.uploadAvatar(
          request.user.id,
          buffer,
          data.filename,
          contentType
        )

        return reply.send({ url, key })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({ error: 'Failed to upload avatar' })
      }
    }
  )

  fastify.delete(
    '/',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        await storageService.deleteAvatar(request.user.id)

        return reply.send({ message: 'Avatar deleted successfully' })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({ error: 'Failed to delete avatar' })
      }
    }
  )

  fastify.post(
    '/presigned-url',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      try {
        const { filename, contentType } = request.body as {
          filename?: string
          contentType?: string
        }

        if (!filename || !contentType) {
          return reply.code(400).send({ error: 'filename and contentType are required' })
        }

        if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
          return reply.code(400).send({ error: 'Invalid content type' })
        }

        const key = storageService.generateKey(filename)
        const signedUrl = await storageService.getSignedUploadUrl(key, contentType)

        return reply.send({
          signedUrl,
          key,
          bucket: storageService.bucket,
        })
      } catch (error) {
        fastify.log.error(error)
        return reply.code(500).send({ error: 'Failed to generate presigned URL' })
      }
    }
  )
}
