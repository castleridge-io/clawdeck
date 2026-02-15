import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser
let testToken

async function setupTestEnvironment () {
  // Create test user
  testUser = await prisma.user.create({
    data: {
      emailAddress: `settings-test-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖',
    },
  })

  // Create test API token
  testToken = `cd_settings_test_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await prisma.apiToken.create({
    data: {
      token: testToken,
      name: 'Settings Test Token',
      userId: testUser.id,
    },
  })
}

async function cleanupTestEnvironment () {
  await prisma.apiToken.deleteMany({})
  await prisma.user.deleteMany({})
}

async function makeRequest (method, path, body = null) {
  const baseUrl = process.env.API_URL || 'http://localhost:3000'
  const url = new URL(path, baseUrl)

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${testToken}`,
      'X-Agent-Name': 'TestAgent',
    },
  }

  // Only set Content-Type if we have a body
  if (body !== null) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  } else if (['PATCH', 'POST', 'PUT'].includes(method.toUpperCase())) {
    // For PATCH/POST/PUT without body, send empty JSON object
    options.headers['Content-Type'] = 'application/json'
    options.body = '{}'
  }

  try {
    const response = await fetch(url.toString(), options)
    const text = await response.text()
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
    }
  } catch (error) {
    return { status: 0, error: error.message }
  }
}

describe('Settings API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('GET /api/v1/settings', () => {
    it('should return user settings', async () => {
      const result = await makeRequest('GET', '/api/v1/settings', null, testToken)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.id, testUser.id.toString())
      assert.strictEqual(result.data.data.email, testUser.emailAddress)
      assert.strictEqual(result.data.data.agent_auto_mode, true)
      assert.strictEqual(result.data.data.agent_name, 'TestAgent')
      assert.strictEqual(result.data.data.agent_emoji, '🤖')
      assert.ok(Array.isArray(result.data.data.api_tokens))
      assert.ok(result.data.data.api_tokens.length >= 1)
    })
  })

  describe('PATCH /api/v1/settings', () => {
    it('should update agent settings', async () => {
      const result = await makeRequest(
        'PATCH',
        '/api/v1/settings',
        {
          agent_name: 'Jarvis',
          agent_emoji: '🔧',
          agent_auto_mode: false,
        },
        testToken
      )

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.agent_name, 'Jarvis')
      assert.strictEqual(result.data.data.agent_emoji, '🔧')
      assert.strictEqual(result.data.data.agent_auto_mode, false)

      // Reset for other tests
      await makeRequest(
        'PATCH',
        '/api/v1/settings',
        {
          agent_name: 'TestAgent',
          agent_emoji: '🤖',
          agent_auto_mode: true,
        },
        testToken
      )
    })
  })

  describe('POST /api/v1/settings/regenerate_token', () => {
    it('should generate new API token', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/settings/regenerate_token',
        {
          name: 'New Token',
        },
        testToken
      )

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.success, true)
      assert.ok(result.data.data.token)
      assert.ok(result.data.data.token.startsWith('cd_'))
      assert.strictEqual(result.data.data.name, 'New Token')
    })

    it('should use default name if not provided', async () => {
      const result = await makeRequest('POST', '/api/v1/settings/regenerate_token', {}, testToken)

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.data.name, 'API Token')
    })
  })
})
