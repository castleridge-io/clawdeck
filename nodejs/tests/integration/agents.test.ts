import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'
import { createTestOrganization, createTestUser, createTestAgent, createTestApiToken, cleanupTestData } from '../test-setup.ts'

// Test utilities
let testUser
let adminUser
let testToken
let adminToken
let testOrg

async function setupTestEnvironment () {
  // Create test organization
  testOrg = await createTestOrganization()

  // Create regular test user
  testUser = await createTestUser(testOrg.id, {
    emailAddress: `agents-test-${Date.now()}@example.com`,
    agentName: 'TestAgent',
  })

  // Create admin user
  adminUser = await createTestUser(testOrg.id, {
    emailAddress: `agents-admin-${Date.now()}@example.com`,
    admin: true,
    agentName: 'AdminAgent',
  })

  // Create test API token for regular user
  testToken = `cd_agents_test_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await createTestApiToken(testUser.id, {
    token,
    name: 'Agents Test Token',
  })

  // Create API token for admin user
  adminToken = `cd_agents_admin_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await createTestApiToken(adminUser.id, {
    token: adminToken,
    name: 'Agents Admin Token',
  })
}

async function cleanupTestEnvironment () {
  await cleanupTestData()
}

async function makeRequest (method, path, body = null, token = null) {
  const baseUrl = process.env.API_URL || 'http://localhost:3000'
  const url = new URL(path, baseUrl)

  const options = {
    method,
    headers: {},
  }

  // Only add auth header if token is explicitly provided (including empty string for no-auth test)
  // token === '' means explicitly no auth, token === null means use default testToken
  if (token === null) {
    options.headers['Authorization'] = `Bearer ${testToken}`
  } else if (token !== '') {
    options.headers['Authorization'] = `Bearer ${token}`
  }
  // If token === '', don't add Authorization header (testing unauthenticated access)

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

describe('Agents API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  // Clean up agents between tests
  beforeEach(async () => {
    await prisma.agent.deleteMany({})
  })

  describe('GET /api/v1/agents', () => {
    it('should return empty array when no agents exist', async () => {
      const result = await makeRequest('GET', '/api/v1/agents')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(Array.isArray(result.data.data))
      assert.strictEqual(result.data.data.length, 0)
    })

    it('should return list of active agents', async () => {
      // Create test agents directly in DB
      await createTestAgent(testOrg.id, 
        data: {
          name: 'Jarvis Leader',
          slug: 'jarvis-leader',
          emoji: '👔',
          color: 'purple',
          isActive: true,
        },
      })
      await createTestAgent(testOrg.id, 
        data: {
          name: 'Dave Engineer',
          slug: 'dave-engineer',
          emoji: '👨‍💻',
          color: 'blue',
          isActive: true,
        },
      })

      const result = await makeRequest('GET', '/api/v1/agents')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(Array.isArray(result.data.data))
      assert.strictEqual(result.data.data.length, 2)

      // Should include uuid, name, slug, emoji, color
      const agent = result.data.data[0]
      assert.ok(agent.uuid, 'should have uuid')
      assert.ok(agent.name, 'should have name')
      assert.ok(agent.slug, 'should have slug')
      assert.ok(agent.emoji, 'should have emoji')
      assert.ok(agent.color, 'should have color')
    })

    it('should not return inactive agents by default', async () => {
      // Create active and inactive agents
      await createTestAgent(testOrg.id, 
        data: {
          name: 'Active Agent',
          slug: 'active-agent',
          emoji: '✅',
          color: 'green',
          isActive: true,
        },
      })
      await createTestAgent(testOrg.id, 
        data: {
          name: 'Inactive Agent',
          slug: 'inactive-agent',
          emoji: '❌',
          color: 'red',
          isActive: false,
        },
      })

      const result = await makeRequest('GET', '/api/v1/agents')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.data.length, 1)
      assert.strictEqual(result.data.data[0].name, 'Active Agent')
    })

    it('should require authentication', async () => {
      const result = await makeRequest('GET', '/api/v1/agents', null, '')

      assert.strictEqual(result.status, 401)
    })
  })

  describe('GET /api/v1/agents/:uuid', () => {
    it('should return single agent by UUID', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Test Agent',
          slug: 'test-agent',
          emoji: '🤖',
          color: 'gray',
        },
      })

      const result = await makeRequest('GET', `/api/v1/agents/${agent.uuid}`)

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.uuid, agent.uuid)
      assert.strictEqual(result.data.data.name, 'Test Agent')
      assert.strictEqual(result.data.data.slug, 'test-agent')
    })

    it('should return 404 for non-existent UUID', async () => {
      const result = await makeRequest('GET', '/api/v1/agents/00000000-0000-0000-0000-000000000000')

      assert.strictEqual(result.status, 404)
    })

    it('should not return inactive agent', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Inactive Agent',
          slug: 'inactive-agent',
          emoji: '❌',
          color: 'red',
          isActive: false,
        },
      })

      const result = await makeRequest('GET', `/api/v1/agents/${agent.uuid}`)

      assert.strictEqual(result.status, 404)
    })
  })

  describe('POST /api/v1/agents', () => {
    it('should create a new agent (admin only)', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          name: 'New Agent',
          slug: 'new-agent',
          emoji: '🚀',
          color: 'orange',
        },
        adminToken
      )

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.name, 'New Agent')
      assert.strictEqual(result.data.data.slug, 'new-agent')
      assert.strictEqual(result.data.data.emoji, '🚀')
      assert.strictEqual(result.data.data.color, 'orange')
      assert.ok(result.data.data.uuid, 'should have auto-generated uuid')
    })

    it('should require admin role', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          name: 'Unauthorized Agent',
          slug: 'unauthorized-agent',
        },
        testToken
      ) // Regular user token

      assert.strictEqual(result.status, 403)
    })

    it('should require name', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          slug: 'no-name-agent',
        },
        adminToken
      )

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('name'))
    })

    it('should require slug', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          name: 'No Slug Agent',
        },
        adminToken
      )

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('slug'))
    })

    it('should reject duplicate name', async () => {
      await createTestAgent(testOrg.id, 
        data: {
          name: 'Duplicate Name',
          slug: 'duplicate-name',
          emoji: '🔄',
          color: 'gray',
        },
      })

      const result = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          name: 'Duplicate Name',
          slug: 'different-slug',
        },
        adminToken
      )

      assert.strictEqual(result.status, 409) // Conflict
    })

    it('should reject duplicate slug', async () => {
      await createTestAgent(testOrg.id, 
        data: {
          name: 'Original Name',
          slug: 'duplicate-slug',
          emoji: '🔄',
          color: 'gray',
        },
      })

      const result = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          name: 'Different Name',
          slug: 'duplicate-slug',
        },
        adminToken
      )

      assert.strictEqual(result.status, 409) // Conflict
    })

    it('should create agent with linked board', async () => {
      // Create board linked to agent (board.agentId -> agent.id)
      const agentResult = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          name: 'Board Agent',
          slug: 'board-agent',
        },
        adminToken
      )

      assert.strictEqual(agentResult.status, 201)

      // Create a board and link it to the agent
      const board = await prisma.board.create({
        data: {
          name: 'Agent Board',
          userId: testUser.id,
          agentId: BigInt(agentResult.data.data.id),
          position: 0,
        },
      })

      assert.ok(board.agentId)
    })

    it('should use default values for optional fields', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/agents',
        {
          name: 'Minimal Agent',
          slug: 'minimal-agent',
        },
        adminToken
      )

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.data.emoji, '🤖') // Default emoji
      assert.strictEqual(result.data.data.color, 'gray') // Default color
      assert.strictEqual(result.data.data.is_active, true) // Default isActive
    })
  })

  describe('POST /api/v1/agents/register', () => {
    it('should register existing agent with provided UUID (admin only)', async () => {
      const providedUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      const result = await makeRequest(
        'POST',
        '/api/v1/agents/register',
        {
          uuid: providedUuid,
          name: 'External Agent',
          slug: 'external-agent',
          emoji: '🌐',
          color: 'blue',
        },
        adminToken
      )

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.uuid, providedUuid)
      assert.strictEqual(result.data.data.name, 'External Agent')
      assert.strictEqual(result.data.data.emoji, '🌐')
    })

    it('should require admin role', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/agents/register',
        {
          uuid: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
          name: 'Unauthorized Register',
          slug: 'unauthorized-register',
        },
        testToken
      )

      assert.strictEqual(result.status, 403)
    })

    it('should require uuid', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/agents/register',
        {
          name: 'No UUID Agent',
          slug: 'no-uuid-agent',
        },
        adminToken
      )

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('uuid'))
    })

    it('should reject duplicate UUID', async () => {
      const uuid = 'c3d4e5f6-a7b8-9012-cdef-345678901234'
      await createTestAgent(testOrg.id, 
        data: {
          uuid,
          name: 'First Agent',
          slug: 'first-agent',
          emoji: '1️⃣',
          color: 'gray',
        },
      })

      const result = await makeRequest(
        'POST',
        '/api/v1/agents/register',
        {
          uuid,
          name: 'Second Agent',
          slug: 'second-agent',
        },
        adminToken
      )

      assert.strictEqual(result.status, 409)
      assert.ok(result.data.error.includes('UUID'))
    })
  })

  describe('PATCH /api/v1/agents/:uuid', () => {
    it('should update agent (admin only)', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Agent to Update',
          slug: 'agent-to-update',
          emoji: '📝',
          color: 'gray',
        },
      })

      const result = await makeRequest(
        'PATCH',
        `/api/v1/agents/${agent.uuid}`,
        {
          name: 'Updated Agent',
          emoji: '✅',
          color: 'green',
        },
        adminToken
      )

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.name, 'Updated Agent')
      assert.strictEqual(result.data.data.emoji, '✅')
      assert.strictEqual(result.data.data.color, 'green')
      // Slug should remain unchanged
      assert.strictEqual(result.data.data.slug, 'agent-to-update')
    })

    it('should require admin role', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Protected Agent',
          slug: 'protected-agent',
          emoji: '🔒',
          color: 'gray',
        },
      })

      const result = await makeRequest(
        'PATCH',
        `/api/v1/agents/${agent.uuid}`,
        {
          name: 'Hacked Agent',
        },
        testToken
      ) // Regular user token

      assert.strictEqual(result.status, 403)
    })

    it('should return 404 for non-existent UUID', async () => {
      const result = await makeRequest(
        'PATCH',
        '/api/v1/agents/00000000-0000-0000-0000-000000000000',
        {
          name: 'Ghost Agent',
        },
        adminToken
      )

      assert.strictEqual(result.status, 404)
    })

    it('should allow updating position', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Position Agent',
          slug: 'position-agent',
          emoji: '📍',
          color: 'gray',
          position: 0,
        },
      })

      const result = await makeRequest(
        'PATCH',
        `/api/v1/agents/${agent.uuid}`,
        {
          position: 5,
        },
        adminToken
      )

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.data.position, 5)
    })

    it('should reject duplicate name on update', async () => {
      await createTestAgent(testOrg.id, 
        data: {
          name: 'Existing Name',
          slug: 'existing-name',
          emoji: '🔹',
          color: 'blue',
        },
      })

      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Original Name',
          slug: 'original-name',
          emoji: '🔸',
          color: 'orange',
        },
      })

      const result = await makeRequest(
        'PATCH',
        `/api/v1/agents/${agent.uuid}`,
        {
          name: 'Existing Name',
        },
        adminToken
      )

      assert.strictEqual(result.status, 409) // Conflict
    })
  })

  describe('DELETE /api/v1/agents/:uuid', () => {
    it('should soft delete agent (admin only)', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Agent to Delete',
          slug: 'agent-to-delete',
          emoji: '🗑️',
          color: 'gray',
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/agents/${agent.uuid}`, null, adminToken)

      assert.strictEqual(result.status, 204)

      // Verify soft delete (isActive = false)
      const deleted = await prisma.agent.findUnique({
        where: { id: agent.id },
      })
      assert.ok(deleted, 'Agent should still exist')
      assert.strictEqual(deleted.isActive, false)
    })

    it('should require admin role', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Protected Agent',
          slug: 'protected-delete-agent',
          emoji: '🔒',
          color: 'gray',
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/agents/${agent.uuid}`, null, testToken)

      assert.strictEqual(result.status, 403)

      // Agent should still be active
      const stillActive = await prisma.agent.findUnique({
        where: { id: agent.id },
      })
      assert.strictEqual(stillActive.isActive, true)
    })

    it('should return 404 for non-existent UUID', async () => {
      const result = await makeRequest(
        'DELETE',
        '/api/v1/agents/00000000-0000-0000-0000-000000000000',
        null,
        adminToken
      )

      assert.strictEqual(result.status, 404)
    })

    it('should return 404 for already deleted agent', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Already Deleted',
          slug: 'already-deleted',
          emoji: '👻',
          color: 'gray',
          isActive: false,
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/agents/${agent.uuid}`, null, adminToken)

      assert.strictEqual(result.status, 404)
    })
  })

  describe('Board association', () => {
    it('should include agent info when fetching board', async () => {
      const agent = await createTestAgent(testOrg.id, 
        data: {
          name: 'Board Agent',
          slug: 'board-agent',
          emoji: '📋',
          color: 'blue',
        },
      })

      const board = await prisma.board.create({
        data: {
          name: 'Agent Board',
          userId: testUser.id,
          agentId: agent.id,
          position: 0,
        },
      })

      const result = await makeRequest('GET', `/api/v1/boards/${board.id}`)

      assert.strictEqual(result.status, 200)
      // Board should include agent reference (snake_case)
      assert.ok(result.data.data.agent_id, 'Board should reference agent')
      assert.strictEqual(result.data.data.agent_id, agent.id.toString())
    })
  })
})
