import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser1
let testUser2
let testOrg1
let testOrg2

async function setupTestEnvironment () {
  // Create test users
  testUser1 = await prisma.user.create({
    data: {
      emailAddress: `org-middleware-user1-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'OrgTestUser1',
    },
  })

  testUser2 = await prisma.user.create({
    data: {
      emailAddress: `org-middleware-user2-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'OrgTestUser2',
    },
  })

  // Create test organizations
  testOrg1 = await prisma.organization.create({
    data: {
      name: 'Test Org 1',
      slug: `test-org-1-${Date.now()}`,
      settings: {},
    },
  })

  testOrg2 = await prisma.organization.create({
    data: {
      name: 'Test Org 2',
      slug: `test-org-2-${Date.now()}`,
      settings: {},
    },
  })

  // Add user1 to both orgs
  await prisma.membership.create({
    data: {
      organizationId: testOrg1.id,
      userId: testUser1.id,
      role: 'owner',
      joinedAt: new Date(),
    },
  })

  await prisma.membership.create({
    data: {
      organizationId: testOrg2.id,
      userId: testUser1.id,
      role: 'member',
      joinedAt: new Date(),
    },
  })

  // Add user2 to org1 only
  await prisma.membership.create({
    data: {
      organizationId: testOrg1.id,
      userId: testUser2.id,
      role: 'viewer',
      joinedAt: new Date(),
    },
  })

  // Set user1's current org to org1
  await prisma.user.update({
    where: { id: testUser1.id },
    data: { currentOrganizationId: testOrg1.id },
  })

  // Set user2's current org to org1
  await prisma.user.update({
    where: { id: testUser2.id },
    data: { currentOrganizationId: testOrg1.id },
  })
}

async function cleanupTestEnvironment () {
  await prisma.membership.deleteMany({
    where: {
      organizationId: { in: [testOrg1?.id, testOrg2?.id].filter(Boolean) },
    },
  })
  await prisma.user.deleteMany({
    where: {
      id: { in: [testUser1?.id, testUser2?.id].filter(Boolean) },
    },
  })
  await prisma.organization.deleteMany({
    where: {
      id: { in: [testOrg1?.id, testOrg2?.id].filter(Boolean) },
    },
  })
}

describe('Organization Middleware', () => {
  let organizationMiddleware

  before(async () => {
    await setupTestEnvironment()
    const { createOrganizationMiddleware } =
      await import('../../src/middleware/organization.middleware.js')
    organizationMiddleware = createOrganizationMiddleware()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('getOrganizationContext', () => {
    it('should return organization context for user with current organization', async () => {
      const context = await organizationMiddleware.getOrganizationContext(testUser1.id)

      assert.ok(context)
      assert.strictEqual(context.organizationId, testOrg1.id.toString())
      assert.strictEqual(context.role, 'owner')
      assert.ok(context.organization)
      assert.strictEqual(context.organization.name, 'Test Org 1')
    })

    it('should return correct role for member', async () => {
      const context = await organizationMiddleware.getOrganizationContext(testUser2.id)

      assert.ok(context)
      assert.strictEqual(context.role, 'viewer')
    })

    it('should return null if user has no current organization', async () => {
      // Create user without org
      const noOrgUser = await prisma.user.create({
        data: {
          emailAddress: `no-org-${Date.now()}@example.com`,
          passwordDigest: 'hash',
          agentAutoMode: true,
        },
      })

      const context = await organizationMiddleware.getOrganizationContext(noOrgUser.id)

      assert.strictEqual(context, null)

      // Cleanup
      await prisma.user.delete({ where: { id: noOrgUser.id } })
    })

    it('should return null if membership no longer exists', async () => {
      // Create user with org but no membership
      const orphanUser = await prisma.user.create({
        data: {
          emailAddress: `orphan-${Date.now()}@example.com`,
          passwordDigest: 'hash',
          agentAutoMode: true,
          currentOrganizationId: testOrg1.id, // Pointing to org but not a member
        },
      })

      const context = await organizationMiddleware.getOrganizationContext(orphanUser.id)

      // Should return null since user is not actually a member
      assert.strictEqual(context, null)

      // Cleanup
      await prisma.user.delete({ where: { id: orphanUser.id } })
    })
  })

  describe('requireOrganization', () => {
    it('should pass when user has organization context', async () => {
      const mockRequest = {
        user: { id: testUser1.id.toString() },
      }
      const mockReply = {
        code: () => mockReply,
        send: () => mockReply,
      }

      const result = await organizationMiddleware.requireOrganization(mockRequest, mockReply)

      assert.strictEqual(result, true)
      assert.ok(mockRequest.organization)
      assert.strictEqual(mockRequest.organization.organizationId, testOrg1.id.toString())
      assert.strictEqual(mockRequest.organization.role, 'owner')
    })

    it('should return 403 when user has no organization', async () => {
      // Create user without org
      const noOrgUser = await prisma.user.create({
        data: {
          emailAddress: `no-org-req-${Date.now()}@example.com`,
          passwordDigest: 'hash',
          agentAutoMode: true,
        },
      })

      const mockRequest = {
        user: { id: noOrgUser.id.toString() },
      }

      let statusCode
      let responseBody
      const mockReply = {
        code: (code) => {
          statusCode = code
          return mockReply
        },
        send: (body) => {
          responseBody = body
          return mockReply
        },
      }

      const result = await organizationMiddleware.requireOrganization(mockRequest, mockReply)

      assert.strictEqual(result, false)
      assert.strictEqual(statusCode, 403)
      assert.ok(responseBody.error)

      // Cleanup
      await prisma.user.delete({ where: { id: noOrgUser.id } })
    })
  })

  describe('requireRole', () => {
    it('should pass for owner checking owner role', async () => {
      const mockRequest = {
        user: { id: testUser1.id.toString() },
        organization: null, // Will be set by middleware
      }
      const mockReply = {
        code: () => mockReply,
        send: () => mockReply,
      }

      // First get org context
      await organizationMiddleware.requireOrganization(mockRequest, mockReply)

      const result = await organizationMiddleware.requireRole(['owner', 'admin'])(
        mockRequest,
        mockReply
      )

      assert.strictEqual(result, true)
    })

    it('should fail for viewer checking admin role', async () => {
      const mockRequest = {
        user: { id: testUser2.id.toString() },
        organization: null,
      }
      const mockReply = {
        code: () => mockReply,
        send: () => mockReply,
      }

      // First get org context
      await organizationMiddleware.requireOrganization(mockRequest, mockReply)

      let statusCode
      const mockReplyWithCapture = {
        code: (code) => {
          statusCode = code
          return mockReplyWithCapture
        },
        send: () => mockReplyWithCapture,
      }

      const result = await organizationMiddleware.requireRole(['owner', 'admin'])(
        mockRequest,
        mockReplyWithCapture
      )

      assert.strictEqual(result, false)
      assert.strictEqual(statusCode, 403)
    })

    it('should pass for any role when checking all roles', async () => {
      const mockRequest = {
        user: { id: testUser2.id.toString() }, // viewer
        organization: null,
      }
      const mockReply = {
        code: () => mockReply,
        send: () => mockReply,
      }

      await organizationMiddleware.requireOrganization(mockRequest, mockReply)

      const result = await organizationMiddleware.requireRole([
        'owner',
        'admin',
        'member',
        'viewer',
      ])(mockRequest, mockReply)

      assert.strictEqual(result, true)
    })
  })

  describe('switchOrganization', () => {
    it('should switch to another organization user is member of', async () => {
      const result = await organizationMiddleware.switchOrganization(testUser1.id, testOrg2.id)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.organization.id, testOrg2.id.toString())
      assert.strictEqual(result.role, 'member')

      // Verify user's current org was updated
      const user = await prisma.user.findUnique({
        where: { id: testUser1.id },
      })
      assert.strictEqual(user.currentOrganizationId.toString(), testOrg2.id.toString())

      // Switch back for other tests
      await prisma.user.update({
        where: { id: testUser1.id },
        data: { currentOrganizationId: testOrg1.id },
      })
    })

    it('should fail to switch to organization user is not member of', async () => {
      await assert.rejects(
        () => organizationMiddleware.switchOrganization(testUser2.id, testOrg2.id),
        /not a member|access denied/i
      )
    })

    it('should fail for non-existent organization', async () => {
      await assert.rejects(
        () => organizationMiddleware.switchOrganization(testUser1.id, 999999999n),
        /not found|not a member/i
      )
    })
  })

  describe('createOrganizationScopedQuery', () => {
    it('should add organizationId to query', async () => {
      const mockRequest = {
        user: { id: testUser1.id.toString() },
        organization: { organizationId: testOrg1.id.toString() },
      }

      const query = { name: 'Test' }
      const scopedQuery = organizationMiddleware.createOrganizationScopedQuery(mockRequest, query)

      assert.strictEqual(scopedQuery.organizationId, testOrg1.id.toString())
      assert.strictEqual(scopedQuery.name, 'Test')
    })

    it('should throw if no organization context', async () => {
      const mockRequest = {
        user: { id: testUser1.id.toString() },
        organization: null,
      }

      assert.throws(
        () => organizationMiddleware.createOrganizationScopedQuery(mockRequest, {}),
        /no organization context/i
      )
    })
  })
})
