import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

const baseUrl = process.env.API_URL || 'http://localhost:3000'

async function cleanupTestEnvironment () {
  await prisma.apiToken.deleteMany({})
  await prisma.session.deleteMany({})
  await prisma.user.deleteMany({
    where: {
      emailAddress: {
        contains: 'auth-test-'
      }
    }
  })
}

async function makeRequest (method, path, body = null, token = null) {
  const url = new URL(path, baseUrl)

  const options = {
    method,
    headers: {}
  }

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`
  }

  if (body !== null) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(url.toString(), options)
    const text = await response.text()
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null
    }
  } catch (error) {
    return { status: 0, error: error.message }
  }
}

describe('Auth API', () => {
  before(async () => {
    await cleanupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and return apiToken', async () => {
      const email = `auth-test-register-${Date.now()}@example.com`
      const result = await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: email,
        password: 'testpassword123'
      })

      assert.strictEqual(result.status, 201)
      assert.ok(result.data.user, 'Should return user object')
      assert.ok(result.data.token, 'Should return JWT token')
      assert.ok(result.data.apiToken, 'Should return apiToken')
      assert.strictEqual(result.data.user.emailAddress, email)

      // Verify apiToken is a hex string (64 chars = 32 bytes)
      assert.match(result.data.apiToken, /^[a-f0-9]{64}$/, 'apiToken should be 64-char hex string')
    })

    it('should create exactly one API token in database on register', async () => {
      const email = `auth-test-single-token-${Date.now()}@example.com`
      const result = await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: email,
        password: 'testpassword123'
      })

      assert.strictEqual(result.status, 201)

      // Check database for tokens
      const user = await prisma.user.findUnique({
        where: { emailAddress: email },
        include: { apiTokens: true }
      })

      assert.ok(user, 'User should exist')
      assert.strictEqual(user.apiTokens.length, 1, 'Should have exactly one API token')
      assert.strictEqual(user.apiTokens[0].token, result.data.apiToken)
      assert.strictEqual(user.apiTokens[0].name, 'Default')
    })

    it('should return 400 for missing email', async () => {
      const result = await makeRequest('POST', '/api/v1/auth/register', {
        password: 'testpassword123'
      })

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Email'))
    })

    it('should return 400 for missing password', async () => {
      const result = await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: `auth-test-no-pass-${Date.now()}@example.com`
      })

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Password'))
    })

    it('should return 400 for short password', async () => {
      const result = await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: `auth-test-short-pass-${Date.now()}@example.com`,
        password: 'short'
      })

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Password'))
    })

    it('should return 409 for duplicate email', async () => {
      const email = `auth-test-duplicate-${Date.now()}@example.com`

      // First registration
      await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: email,
        password: 'testpassword123'
      })

      // Second registration with same email
      const result = await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: email,
        password: 'testpassword123'
      })

      assert.strictEqual(result.status, 409)
      assert.ok(result.data.error.includes('already exists'))
    })
  })

  describe('POST /api/v1/auth/login', () => {
    let testEmail
    let testPassword
    let registeredApiToken

    before(async () => {
      testEmail = `auth-test-login-${Date.now()}@example.com`
      testPassword = 'testpassword123'

      const result = await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: testEmail,
        password: testPassword
      })

      assert.strictEqual(result.status, 201)
      registeredApiToken = result.data.apiToken
    })

    it('should login and return apiToken', async () => {
      const result = await makeRequest('POST', '/api/v1/auth/login', {
        emailAddress: testEmail,
        password: testPassword
      })

      assert.strictEqual(result.status, 200)
      assert.ok(result.data.user, 'Should return user object')
      assert.ok(result.data.token, 'Should return JWT token')
      assert.ok(result.data.apiToken, 'Should return apiToken')
      assert.strictEqual(result.data.user.emailAddress, testEmail)
    })

    it('should return same apiToken as registration', async () => {
      const result = await makeRequest('POST', '/api/v1/auth/login', {
        emailAddress: testEmail,
        password: testPassword
      })

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.apiToken, registeredApiToken, 'apiToken should match the one from registration')
    })

    it('should return 401 for invalid credentials', async () => {
      const result = await makeRequest('POST', '/api/v1/auth/login', {
        emailAddress: testEmail,
        password: 'wrongpassword'
      })

      assert.strictEqual(result.status, 401)
      assert.ok(result.data.error.includes('Invalid'))
    })

    it('should return 401 for non-existent user', async () => {
      const result = await makeRequest('POST', '/api/v1/auth/login', {
        emailAddress: 'nonexistent@example.com',
        password: 'testpassword123'
      })

      assert.strictEqual(result.status, 401)
      assert.ok(result.data.error.includes('Invalid'))
    })
  })

  describe('API Token Authentication', () => {
    let apiToken

    before(async () => {
      const email = `auth-test-apitoken-${Date.now()}@example.com`
      const result = await makeRequest('POST', '/api/v1/auth/register', {
        emailAddress: email,
        password: 'testpassword123'
      })

      assert.strictEqual(result.status, 201)
      apiToken = result.data.apiToken
    })

    it('should authenticate with apiToken on protected endpoints', async () => {
      const result = await makeRequest('GET', '/api/v1/boards', null, apiToken)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
    })

    it('should authenticate with apiToken on /auth/me', async () => {
      const result = await makeRequest('GET', '/api/v1/auth/me', null, apiToken)

      assert.strictEqual(result.status, 200)
      assert.ok(result.data.id)
      assert.ok(result.data.emailAddress)
    })
  })
})
