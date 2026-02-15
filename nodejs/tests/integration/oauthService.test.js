import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser
let testOrganization

async function setupTestEnvironment () {
  // Create a test organization for linking tests
  testOrganization = await prisma.organization.create({
    data: {
      name: 'Test OAuth Org',
      slug: `test-oauth-org-${Date.now()}`,
      settings: {},
    },
  })

  // Create a test user for linking OAuth accounts
  testUser = await prisma.user.create({
    data: {
      emailAddress: `oauth-test-user-${Date.now()}@example.com`,
      passwordDigest: 'existing-hash',
      agentAutoMode: true,
      agentName: 'OAuthTestUser',
      agentEmoji: '🔐',
      currentOrganizationId: testOrganization.id,
    },
  })

  // Add user as member of the org
  await prisma.membership.create({
    data: {
      organizationId: testOrganization.id,
      userId: testUser.id,
      role: 'owner',
      joinedAt: new Date(),
    },
  })
}

async function cleanupTestEnvironment () {
  // Clean up in reverse dependency order
  await prisma.oAuthAccount.deleteMany({})
  await prisma.membership.deleteMany({})
  await prisma.user.deleteMany({
    where: {
      id: testUser?.id,
    },
  })
  await prisma.organization.deleteMany({
    where: {
      id: testOrganization?.id,
    },
  })

  // Clean up any users created during tests
  const testUsers = await prisma.user.findMany({
    where: {
      emailAddress: { contains: 'oauth-' },
    },
  })
  for (const user of testUsers) {
    await prisma.oAuthAccount.deleteMany({
      where: { userId: user.id },
    })
    await prisma.membership.deleteMany({
      where: { userId: user.id },
    })
    await prisma.user.delete({ where: { id: user.id } })
  }

  // Clean up orgs created during tests
  const testOrgs = await prisma.organization.findMany({
    where: {
      slug: { contains: 'oauth-' },
    },
  })
  for (const org of testOrgs) {
    await prisma.membership.deleteMany({
      where: { organizationId: org.id },
    })
    await prisma.organization.delete({ where: { id: org.id } })
  }
}

describe('OAuth Service', () => {
  let oauthService

  before(async () => {
    await setupTestEnvironment()
    const { createOAuthService } = await import('../../src/services/oauth.service.js')
    oauthService = createOAuthService()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('findOrCreateUserFromGoogle', () => {
    it('should create a new user from Google profile', async () => {
      const timestamp = Date.now()
      const profile = {
        id: `google-${timestamp}`,
        displayName: 'John Doe',
        emails: [{ value: `john.doe.google.${timestamp}@test.com`, verified: true }],
        photos: [{ value: 'https://example.com/photo.jpg' }],
      }

      const result = await oauthService.findOrCreateUserFromGoogle(
        profile,
        'access-token-123',
        'refresh-token-456'
      )

      assert.ok(result.user.id)
      assert.strictEqual(result.user.emailAddress, profile.emails[0].value)
      assert.strictEqual(result.user.agentName, 'John Doe')
      assert.strictEqual(result.isNewUser, true)

      // Verify organization was created
      assert.ok(result.organization)
      assert.ok(result.organization.id)
      assert.ok(result.organization.name.includes('John'))

      // Verify OAuth account was linked
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: BigInt(result.user.id),
          provider: 'google',
        },
      })
      assert.ok(oauthAccount)
      assert.strictEqual(oauthAccount.providerId, profile.id)
    })

    it('should return existing user if Google account already linked', async () => {
      // First, link Google account to test user
      await prisma.oAuthAccount.create({
        data: {
          userId: testUser.id,
          provider: 'google',
          providerId: 'google-existing-123',
          accessToken: 'old-token',
          refreshToken: 'old-refresh',
        },
      })

      const profile = {
        id: 'google-existing-123',
        displayName: 'Updated Name',
        emails: [{ value: testUser.emailAddress, verified: true }],
      }

      const result = await oauthService.findOrCreateUserFromGoogle(
        profile,
        'new-access-token',
        'new-refresh-token'
      )

      assert.strictEqual(result.user.id, testUser.id.toString())
      assert.strictEqual(result.isNewUser, false)
      assert.strictEqual(result.user.emailAddress, testUser.emailAddress)

      // Verify tokens were updated
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: testUser.id,
          provider: 'google',
        },
      })
      assert.strictEqual(oauthAccount.accessToken, 'new-access-token')
    })

    it('should link Google account to existing user by email', async () => {
      const profile = {
        id: 'google-new-link',
        displayName: 'Test User Link',
        emails: [{ value: testUser.emailAddress, verified: true }],
      }

      const result = await oauthService.findOrCreateUserFromGoogle(
        profile,
        'link-access-token',
        'link-refresh-token'
      )

      assert.strictEqual(result.user.id, testUser.id.toString())
      assert.strictEqual(result.isNewUser, false)
      assert.strictEqual(result.needsOrgAssignment, false)

      // Verify OAuth account was created
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: testUser.id,
          provider: 'google',
          providerId: 'google-new-link',
        },
      })
      assert.ok(oauthAccount)
    })
  })

  describe('findOrCreateUserFromGitHub', () => {
    it('should create a new user from GitHub profile', async () => {
      const timestamp = Date.now()
      const profile = {
        id: `github-${timestamp}`,
        username: 'johndoe',
        displayName: 'John GitHub',
        emails: [{ value: `john.doe.github.${timestamp}@test.com` }],
        photos: [{ value: 'https://github.com/avatar.png' }],
      }

      const result = await oauthService.findOrCreateUserFromGitHub(profile, 'gh-access-token', null)

      assert.ok(result.user.id)
      assert.strictEqual(result.user.emailAddress, profile.emails[0].value)
      assert.strictEqual(result.user.agentName, 'John GitHub')
      assert.strictEqual(result.isNewUser, true)

      // Verify organization was created
      assert.ok(result.organization)

      // Verify OAuth account was linked
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: BigInt(result.user.id),
          provider: 'github',
        },
      })
      assert.ok(oauthAccount)
      assert.strictEqual(oauthAccount.providerId, profile.id.toString())
    })

    it('should return existing user if GitHub account already linked', async () => {
      // First, link GitHub account to test user
      await prisma.oAuthAccount.create({
        data: {
          userId: testUser.id,
          provider: 'github',
          providerId: 'github-existing-456',
          accessToken: 'old-gh-token',
        },
      })

      const profile = {
        id: 'github-existing-456',
        username: 'updateduser',
        emails: [{ value: testUser.emailAddress }],
      }

      const result = await oauthService.findOrCreateUserFromGitHub(profile, 'new-gh-token', null)

      assert.strictEqual(result.user.id, testUser.id.toString())
      assert.strictEqual(result.isNewUser, false)

      // Verify token was updated
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: testUser.id,
          provider: 'github',
        },
      })
      assert.strictEqual(oauthAccount.accessToken, 'new-gh-token')
    })

    it('should link GitHub account to existing user by email', async () => {
      const profile = {
        id: 'github-new-link',
        username: 'testlink',
        emails: [{ value: testUser.emailAddress }],
      }

      const result = await oauthService.findOrCreateUserFromGitHub(profile, 'link-gh-token', null)

      assert.strictEqual(result.user.id, testUser.id.toString())
      assert.strictEqual(result.isNewUser, false)

      // Verify OAuth account was created
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: testUser.id,
          provider: 'github',
          providerId: 'github-new-link',
        },
      })
      assert.ok(oauthAccount)
    })
  })

  describe('unlinkOAuthAccount', () => {
    it('should unlink an OAuth account from user', async () => {
      // Create a linked account
      await prisma.oAuthAccount.create({
        data: {
          userId: testUser.id,
          provider: 'google',
          providerId: 'google-to-unlink',
          accessToken: 'token',
        },
      })

      await oauthService.unlinkOAuthAccount(testUser.id, 'google')

      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: {
          userId: testUser.id,
          provider: 'google',
          providerId: 'google-to-unlink',
        },
      })

      assert.strictEqual(oauthAccount, null)
    })

    it('should throw error if user has no other login method', async () => {
      // Create a user with only OAuth login (no password)
      const oauthOnlyUser = await prisma.user.create({
        data: {
          emailAddress: `oauth-only-${Date.now()}@example.com`,
          passwordDigest: null, // No password
          agentAutoMode: true,
        },
      })

      // Link their only OAuth account
      await prisma.oAuthAccount.create({
        data: {
          userId: oauthOnlyUser.id,
          provider: 'github',
          providerId: 'github-only',
          accessToken: 'token',
        },
      })

      await assert.rejects(
        () => oauthService.unlinkOAuthAccount(oauthOnlyUser.id, 'github'),
        /cannot unlink.*no other login|last login method/i
      )

      // Cleanup
      await prisma.oAuthAccount.deleteMany({ where: { userId: oauthOnlyUser.id } })
      await prisma.user.delete({ where: { id: oauthOnlyUser.id } })
    })
  })

  describe('getLinkedAccounts', () => {
    it('should return all linked OAuth accounts for a user', async () => {
      // Link multiple accounts
      await prisma.oAuthAccount.create({
        data: {
          userId: testUser.id,
          provider: 'google',
          providerId: 'google-multi',
          accessToken: 'token-google',
        },
      })

      await prisma.oAuthAccount.create({
        data: {
          userId: testUser.id,
          provider: 'github',
          providerId: 'github-multi',
          accessToken: 'token-github',
        },
      })

      const accounts = await oauthService.getLinkedAccounts(testUser.id)

      assert.ok(accounts.length >= 2)
      assert.ok(accounts.some((a) => a.provider === 'google'))
      assert.ok(accounts.some((a) => a.provider === 'github'))

      // Cleanup
      await prisma.oAuthAccount.deleteMany({
        where: {
          userId: testUser.id,
          providerId: { in: ['google-multi', 'github-multi'] },
        },
      })
    })
  })

  describe('generateOAuthState', () => {
    it('should generate a secure state token', async () => {
      const state1 = await oauthService.generateOAuthState()
      const state2 = await oauthService.generateOAuthState()

      assert.ok(state1)
      assert.ok(state2)
      assert.notStrictEqual(state1, state2)
      assert.ok(state1.length >= 32)
    })
  })

  describe('verifyOAuthState', () => {
    it('should verify a valid state token', async () => {
      const state = await oauthService.generateOAuthState()
      const isValid = await oauthService.verifyOAuthState(state)

      assert.strictEqual(isValid, true)
    })

    it('should reject an invalid state token', async () => {
      const isValid = await oauthService.verifyOAuthState('invalid-state-token')

      assert.strictEqual(isValid, false)
    })

    it('should reject a reused state token (one-time use)', async () => {
      const state = await oauthService.generateOAuthState()

      // First use should succeed
      const firstUse = await oauthService.verifyOAuthState(state)
      assert.strictEqual(firstUse, true)

      // Second use should fail (replay protection)
      const secondUse = await oauthService.verifyOAuthState(state)
      assert.strictEqual(secondUse, false)
    })
  })
})
