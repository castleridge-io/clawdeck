import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser1
let testUser2

async function setupTestEnvironment () {
  // Create test users
  testUser1 = await prisma.user.create({
    data: {
      emailAddress: `org-test-user1-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestUser1',
      agentEmoji: '🧪',
    },
  })

  testUser2 = await prisma.user.create({
    data: {
      emailAddress: `org-test-user2-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: false,
      agentName: null,
      agentEmoji: null,
    },
  })
}

async function cleanupTestEnvironment () {
  // Clean up in reverse dependency order
  await prisma.membership.deleteMany({})
  await prisma.organization.deleteMany({})
  await prisma.user.deleteMany({
    where: {
      id: { in: [testUser1?.id, testUser2?.id].filter(Boolean) },
    },
  })
}

describe('Organization Service', () => {
  let organizationService

  before(async () => {
    await setupTestEnvironment()
    // Import the service - will fail until we create it
    const { createOrganizationService } = await import('../../src/services/organization.service.js')
    organizationService = createOrganizationService()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('createOrganization', () => {
    it('should create an organization with the creator as owner', async () => {
      const org = await organizationService.createOrganization({
        name: 'Test Organization',
        slug: `test-org-${Date.now()}`,
        creatorId: testUser1.id,
      })

      assert.ok(org.id)
      assert.strictEqual(org.name, 'Test Organization')
      assert.strictEqual(org.plan, 'free')
      assert.strictEqual(org.maxMembers, 5)

      // Verify creator is owner
      const membership = await prisma.membership.findFirst({
        where: {
          organizationId: org.id,
          userId: testUser1.id,
        },
      })

      assert.ok(membership)
      assert.strictEqual(membership.role, 'owner')
    })

    it('should generate unique slug from name if not provided', async () => {
      const org = await organizationService.createOrganization({
        name: 'My Cool Company',
        creatorId: testUser1.id,
      })

      assert.ok(org.slug)
      assert.match(org.slug, /^my-cool-company/)
    })

    it('should auto-generate unique slug when duplicate provided', async () => {
      const slug = `dup-slug-${Date.now()}`

      const org1 = await organizationService.createOrganization({
        name: 'First Org',
        slug,
        creatorId: testUser1.id,
      })

      const org2 = await organizationService.createOrganization({
        name: 'Second Org',
        slug,
        creatorId: testUser2.id,
      })

      // First org should have exact slug
      assert.strictEqual(org1.slug, slug)
      // Second org should have a modified unique slug
      assert.ok(org2.slug.startsWith(slug + '-'))
      assert.notStrictEqual(org1.slug, org2.slug)
    })

    it('should set user currentOrganizationId', async () => {
      const org = await organizationService.createOrganization({
        name: 'Current Org Test',
        slug: `current-org-${Date.now()}`,
        creatorId: testUser1.id,
        setAsCurrent: true,
      })

      const user = await prisma.user.findUnique({
        where: { id: testUser1.id },
      })

      assert.strictEqual(user.currentOrganizationId?.toString(), org.id.toString())
    })
  })

  describe('getOrganization', () => {
    it('should return organization with membership info', async () => {
      const org = await organizationService.createOrganization({
        name: 'Get Test Org',
        slug: `get-test-${Date.now()}`,
        creatorId: testUser1.id,
      })

      const result = await organizationService.getOrganization(org.id, testUser1.id)

      assert.ok(result)
      assert.strictEqual(result.id.toString(), org.id.toString())
      assert.ok(result.membership)
      assert.strictEqual(result.membership.role, 'owner')
    })

    it('should return null if user is not a member', async () => {
      const org = await organizationService.createOrganization({
        name: 'Private Org',
        slug: `private-${Date.now()}`,
        creatorId: testUser1.id,
      })

      const result = await organizationService.getOrganization(org.id, testUser2.id)

      assert.strictEqual(result, null)
    })
  })

  describe('listUserOrganizations', () => {
    it('should list all organizations user is a member of', async () => {
      // Create two orgs for user1
      await organizationService.createOrganization({
        name: 'Org A',
        slug: `org-a-${Date.now()}`,
        creatorId: testUser1.id,
      })

      await organizationService.createOrganization({
        name: 'Org B',
        slug: `org-b-${Date.now() + 1}`,
        creatorId: testUser1.id,
      })

      const orgs = await organizationService.listUserOrganizations(testUser1.id)

      assert.ok(orgs.length >= 2)
      assert.ok(orgs.some((o) => o.name === 'Org A'))
      assert.ok(orgs.some((o) => o.name === 'Org B'))
    })

    it('should include membership role in response', async () => {
      const slug = `role-test-${Date.now()}`
      await organizationService.createOrganization({
        name: 'Role Test Org',
        slug,
        creatorId: testUser1.id,
      })

      const orgs = await organizationService.listUserOrganizations(testUser1.id)
      const org = orgs.find((o) => o.slug === slug)

      assert.ok(org)
      assert.strictEqual(org.role, 'owner')
    })
  })

  describe('addMember', () => {
    let testOrg

    before(async () => {
      testOrg = await organizationService.createOrganization({
        name: 'Member Test Org',
        slug: `member-test-${Date.now()}`,
        creatorId: testUser1.id,
      })
    })

    it('should add a new member to organization', async () => {
      const membership = await organizationService.addMember({
        organizationId: testOrg.id,
        userId: testUser2.id,
        role: 'member',
        invitedBy: testUser1.id,
      })

      assert.ok(membership.id)
      assert.strictEqual(membership.role, 'member')
      assert.strictEqual(membership.userId.toString(), testUser2.id.toString())
    })

    it('should reject duplicate membership', async () => {
      await assert.rejects(
        () =>
          organizationService.addMember({
            organizationId: testOrg.id,
            userId: testUser2.id,
            role: 'admin',
            invitedBy: testUser1.id,
          }),
        /already a member|unique/i
      )
    })

    it('should enforce max members limit', async () => {
      // Create org with max 1 member
      const smallOrg = await organizationService.createOrganization({
        name: 'Small Org',
        slug: `small-${Date.now()}`,
        creatorId: testUser1.id,
        maxMembers: 1,
      })

      // Create a third user
      const user3 = await prisma.user.create({
        data: {
          emailAddress: `org-test-user3-${Date.now()}@example.com`,
          passwordDigest: 'hash',
        },
      })

      await assert.rejects(
        () =>
          organizationService.addMember({
            organizationId: smallOrg.id,
            userId: user3.id,
            role: 'member',
            invitedBy: testUser1.id,
          }),
        /maximum.*members|limit/i
      )

      // Cleanup
      await prisma.user.delete({ where: { id: user3.id } })
    })
  })

  describe('updateMemberRole', () => {
    it('should update member role', async () => {
      const org = await organizationService.createOrganization({
        name: 'Role Update Org',
        slug: `role-update-${Date.now()}`,
        creatorId: testUser1.id,
      })

      const user = await prisma.user.create({
        data: {
          emailAddress: `role-test-${Date.now()}@example.com`,
          passwordDigest: 'hash',
        },
      })

      await organizationService.addMember({
        organizationId: org.id,
        userId: user.id,
        role: 'member',
        invitedBy: testUser1.id,
      })

      const updated = await organizationService.updateMemberRole({
        organizationId: org.id,
        userId: user.id,
        role: 'admin',
      })

      assert.strictEqual(updated.role, 'admin')

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } })
    })

    it('should not allow removing the last owner', async () => {
      const org = await organizationService.createOrganization({
        name: 'Last Owner Org',
        slug: `last-owner-${Date.now()}`,
        creatorId: testUser1.id,
      })

      await assert.rejects(
        () =>
          organizationService.updateMemberRole({
            organizationId: org.id,
            userId: testUser1.id,
            role: 'admin',
          }),
        /last owner|cannot remove/i
      )
    })
  })

  describe('removeMember', () => {
    it('should remove member from organization', async () => {
      const org = await organizationService.createOrganization({
        name: 'Remove Member Org',
        slug: `remove-member-${Date.now()}`,
        creatorId: testUser1.id,
      })

      const user = await prisma.user.create({
        data: {
          emailAddress: `remove-test-${Date.now()}@example.com`,
          passwordDigest: 'hash',
        },
      })

      await organizationService.addMember({
        organizationId: org.id,
        userId: user.id,
        role: 'member',
        invitedBy: testUser1.id,
      })

      await organizationService.removeMember({
        organizationId: org.id,
        userId: user.id,
      })

      const membership = await prisma.membership.findFirst({
        where: { organizationId: org.id, userId: user.id },
      })

      assert.strictEqual(membership, null)

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } })
    })

    it('should not allow removing the last owner', async () => {
      const org = await organizationService.createOrganization({
        name: 'No Remove Last Owner',
        slug: `no-remove-${Date.now()}`,
        creatorId: testUser1.id,
      })

      await assert.rejects(
        () =>
          organizationService.removeMember({
            organizationId: org.id,
            userId: testUser1.id,
          }),
        /last owner|cannot remove/i
      )
    })
  })

  describe('switchOrganization', () => {
    it('should update user currentOrganizationId', async () => {
      const org = await organizationService.createOrganization({
        name: 'Switch Test Org',
        slug: `switch-test-${Date.now()}`,
        creatorId: testUser1.id,
      })

      await organizationService.switchOrganization(testUser1.id, org.id)

      const user = await prisma.user.findUnique({
        where: { id: testUser1.id },
      })

      assert.strictEqual(user.currentOrganizationId?.toString(), org.id.toString())
    })

    it('should reject if user is not a member', async () => {
      const org = await organizationService.createOrganization({
        name: 'Private Switch Org',
        slug: `private-switch-${Date.now()}`,
        creatorId: testUser1.id,
      })

      await assert.rejects(
        () => organizationService.switchOrganization(testUser2.id, org.id),
        /not a member|unauthorized/i
      )
    })
  })
})
