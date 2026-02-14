import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { organizationsRoutes } from './organizations.js'
import { prisma } from '../db/prisma.js'

// Mock prisma
vi.mock('../db/prisma.js', () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
    },
  },
}))

// Mock auth middleware
vi.mock('../middleware/auth.js', () => ({
  authenticateRequest: vi.fn((request, reply, done) => done()),
}))

describe('Organizations Routes', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(() => {
    vi.clearAllMocks()
    app = Fastify()
    app.register(organizationsRoutes, { prefix: '/organizations' })
  })

  describe('GET /organizations', () => {
    it('returns all organizations for admin users', async () => {
      // #given
      const mockOrgs = [
        { id: BigInt(1), name: 'Org 1', slug: 'org-1' },
        { id: BigInt(2), name: 'Org 2', slug: 'org-2' },
      ]
      vi.mocked(prisma.organization.findMany).mockResolvedValue(mockOrgs)

      // Mock admin user
      app.addHook('onRequest', (request, reply, done) => {
        request.user = { id: 1, admin: true }
        done()
      })

      // #when
      const response = await app.inject({
        method: 'GET',
        url: '/organizations',
      })

      // #then
      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.body)
      expect(data.success).toBe(true)
      expect(data.data).toHaveLength(2)
      expect(data.data[0]).toHaveProperty('id', '1')
      expect(data.data[0]).toHaveProperty('name', 'Org 1')
      expect(prisma.organization.findMany).toHaveBeenCalled()
    })

    it('returns only user organizations for non-admin users', async () => {
      // #given
      const mockMemberships = [
        {
          organization: { id: BigInt(1), name: 'My Org', slug: 'my-org' },
        },
      ]
      vi.mocked(prisma.membership.findMany).mockResolvedValue(mockMemberships as unknown as Awaited<ReturnType<typeof prisma.membership.findMany>>)

      // Mock non-admin user
      app.addHook('onRequest', (request, reply, done) => {
        request.user = { id: 1, admin: false }
        done()
      })

      // #when
      const response = await app.inject({
        method: 'GET',
        url: '/organizations',
      })

      // #then
      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.body)
      expect(data.success).toBe(true)
      expect(data.data).toHaveLength(1)
      expect(data.data[0]).toHaveProperty('name', 'My Org')
      expect(prisma.membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: BigInt(1) },
        })
      )
    })

    it('returns empty array when user has no organizations', async () => {
      // #given
      vi.mocked(prisma.membership.findMany).mockResolvedValue([])

      app.addHook('onRequest', (request, reply, done) => {
        request.user = { id: 1, admin: false }
        done()
      })

      // #when
      const response = await app.inject({
        method: 'GET',
        url: '/organizations',
      })

      // #then
      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.body)
      expect(data.data).toHaveLength(0)
    })
  })
})
