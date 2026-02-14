import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { boardsRoutes } from './boards.js'
import { prisma } from '../db/prisma.js'

// Mock prisma
vi.mock('../db/prisma.js', () => ({
  prisma: {
    board: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    agent: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

// Mock auth middleware
vi.mock('../middleware/auth.js', () => ({
  authenticateRequest: vi.fn((request, reply, done) => done()),
}))

describe('Boards Routes - Organization Filtering', () => {
  let app: ReturnType<typeof Fastify>

  const mockBoardWithRelations = {
    id: BigInt(1),
    name: 'Test Board',
    icon: '📋',
    color: 'gray',
    position: 0,
    userId: BigInt(1),
    agentId: null,
    organizationId: BigInt(1),
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: { id: BigInt(1), name: 'Test Org' },
    user: { id: BigInt(1), emailAddress: 'test@test.com' },
    agent: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    app = Fastify()
    app.register(boardsRoutes, { prefix: '/boards' })
  })

  describe('GET /boards', () => {
    it('returns all boards for admin users without organization filter', async () => {
      // #given
      vi.mocked(prisma.board.findMany).mockResolvedValue([mockBoardWithRelations])

      app.addHook('onRequest', (request, reply, done) => {
        request.user = { id: 1, admin: true }
        done()
      })

      // #when
      const response = await app.inject({
        method: 'GET',
        url: '/boards',
      })

      // #then
      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.body)
      expect(data.success).toBe(true)
      expect(data.data).toHaveLength(1)
      expect(prisma.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          include: expect.objectContaining({
            organization: expect.any(Object),
            user: expect.any(Object),
            agent: expect.any(Object),
          }),
        })
      )
    })

    it('filters boards by organization_id when provided', async () => {
      // #given
      vi.mocked(prisma.board.findMany).mockResolvedValue([mockBoardWithRelations])

      app.addHook('onRequest', (request, reply, done) => {
        request.user = { id: 1, admin: true }
        done()
      })

      // #when
      const response = await app.inject({
        method: 'GET',
        url: '/boards?organization_id=1',
      })

      // #then
      expect(response.statusCode).toBe(200)
      expect(prisma.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: BigInt(1) },
        })
      )
    })

    it('returns only user boards for non-admin users', async () => {
      // #given
      vi.mocked(prisma.board.findMany).mockResolvedValue([mockBoardWithRelations])

      app.addHook('onRequest', (request, reply, done) => {
        request.user = { id: 1, admin: false }
        done()
      })

      // #when
      const response = await app.inject({
        method: 'GET',
        url: '/boards',
      })

      // #then
      expect(response.statusCode).toBe(200)
      expect(prisma.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: BigInt(1) },
        })
      )
    })

    it('includes organization info in board response', async () => {
      // #given
      vi.mocked(prisma.board.findMany).mockResolvedValue([mockBoardWithRelations])

      app.addHook('onRequest', (request, reply, done) => {
        request.user = { id: 1, admin: true }
        done()
      })

      // #when
      const response = await app.inject({
        method: 'GET',
        url: '/boards',
      })

      // #then
      const data = JSON.parse(response.body)
      expect(data.data[0]).toHaveProperty('organization_id', '1')
      expect(data.data[0]).toHaveProperty('organization_name', 'Test Org')
      expect(data.data[0]).toHaveProperty('owner_email', 'test@test.com')
    })
  })
})
