import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { prisma } from '../../src/db/prisma.js'

// Test utilities
let testUser
let testBoard
let testToken

async function setupTestEnvironment () {
  // Create test user
  testUser = await prisma.user.create({
    data: {
      emailAddress: `boards-test-${Date.now()}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
    },
  })

  // Create test API token
  testToken = `cd_board_test_${Date.now()}_${Math.random().toString(36).substring(7)}`
  await prisma.apiToken.create({
    data: {
      token: testToken,
      name: 'Board Test Token',
      userId: testUser.id,
    },
  })

  // Create test board
  testBoard = await prisma.board.create({
    data: {
      name: 'Test Board',
      userId: testUser.id,
      position: 0,
    },
  })
}

async function cleanupTestEnvironment () {
  await prisma.board.deleteMany({})
  await prisma.agent.deleteMany({})
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

describe('Boards API', () => {
  before(async () => {
    await setupTestEnvironment()
  })

  after(async () => {
    await cleanupTestEnvironment()
  })

  describe('GET /api/v1/boards', () => {
    it('should return user boards', async () => {
      const result = await makeRequest('GET', '/api/v1/boards')

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.ok(Array.isArray(result.data.data))
      assert.ok(result.data.data.length >= 1)
      assert.strictEqual(result.data.data[0].name, 'Test Board')
    })
  })

  describe('POST /api/v1/boards', () => {
    it('should create a new board', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/boards',
        {
          name: 'New Board',
          icon: '📊',
          color: 'blue',
        },
        testToken
      )

      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.name, 'New Board')
      assert.strictEqual(result.data.data.icon, '📊')
      assert.strictEqual(result.data.data.color, 'blue')
    })

    it('should require name', async () => {
      const result = await makeRequest(
        'POST',
        '/api/v1/boards',
        {
          icon: '📋',
        },
        testToken
      )

      assert.strictEqual(result.status, 400)
      assert.strictEqual(result.data.error, 'name is required')
    })
  })

  describe('PATCH /api/v1/boards/:id', () => {
    it('should update board', async () => {
      // Create a board to update
      const board = await prisma.board.create({
        data: {
          name: 'Board to Update',
          userId: testUser.id,
          position: 99,
        },
      })

      const result = await makeRequest(
        'PATCH',
        `/api/v1/boards/${board.id}`,
        {
          name: 'Updated Board Name',
          color: 'green',
        },
        testToken
      )

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.data.name, 'Updated Board Name')
      assert.strictEqual(result.data.data.color, 'green')
    })

    it('should update board agent_id to link board to agent', async () => {
      // Create an agent
      const agent = await prisma.agent.create({
        data: {
          uuid: 'test-agent-for-board',
          name: 'Test Agent for Board',
          slug: 'test-agent-board',
          emoji: '🤖',
          color: 'blue',
          isActive: true,
        },
      })

      // Create a board without agent
      const board = await prisma.board.create({
        data: {
          name: 'Board to Link',
          userId: testUser.id,
          position: 100,
        },
      })

      // Verify board has no agent initially
      assert.strictEqual(board.agentId, null)

      // Update board with agent_id
      const result = await makeRequest(
        'PATCH',
        `/api/v1/boards/${board.id}`,
        {
          agent_id: agent.uuid,
        },
        testToken
      )

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.success, true)
      assert.strictEqual(result.data.data.agent_id, agent.uuid)

      // Verify in database
      const updatedBoard = await prisma.board.findUnique({
        where: { id: board.id },
      })
      assert.strictEqual(updatedBoard.agentId.toString(), agent.id.toString())
    })

    it('should unlink board from agent by setting agent_id to null', async () => {
      // Create an agent
      const agent = await prisma.agent.create({
        data: {
          uuid: 'test-agent-unlink',
          name: 'Test Agent Unlink',
          slug: 'test-agent-unlink',
          emoji: '🤖',
          color: 'red',
          isActive: true,
        },
      })

      // Create a board linked to agent
      const board = await prisma.board.create({
        data: {
          name: 'Board to Unlink',
          userId: testUser.id,
          agentId: agent.id,
          position: 101,
        },
      })

      // Unlink by setting agent_id to null
      const result = await makeRequest(
        'PATCH',
        `/api/v1/boards/${board.id}`,
        {
          agent_id: null,
        },
        testToken
      )

      assert.strictEqual(result.status, 200)
      assert.strictEqual(result.data.data.agent_id, null)

      // Verify in database
      const updatedBoard = await prisma.board.findUnique({
        where: { id: board.id },
      })
      assert.strictEqual(updatedBoard.agentId, null)
    })

    it('should return 400 for non-existent agent UUID', async () => {
      const board = await prisma.board.create({
        data: {
          name: 'Board Bad Agent',
          userId: testUser.id,
          position: 102,
        },
      })

      const result = await makeRequest(
        'PATCH',
        `/api/v1/boards/${board.id}`,
        {
          agent_id: 'non-existent-uuid-12345',
        },
        testToken
      )

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Agent not found'))
    })

    it('should return 400 for inactive agent UUID', async () => {
      // Create inactive agent
      const agent = await prisma.agent.create({
        data: {
          uuid: 'inactive-agent-uuid',
          name: 'Inactive Agent',
          slug: 'inactive-agent',
          emoji: '❌',
          color: 'gray',
          isActive: false,
        },
      })

      const board = await prisma.board.create({
        data: {
          name: 'Board Inactive Agent',
          userId: testUser.id,
          position: 103,
        },
      })

      const result = await makeRequest(
        'PATCH',
        `/api/v1/boards/${board.id}`,
        {
          agent_id: agent.uuid,
        },
        testToken
      )

      assert.strictEqual(result.status, 400)
      assert.ok(result.data.error.includes('Agent not found'))
    })

    it('should return 404 for non-existent board', async () => {
      const result = await makeRequest(
        'PATCH',
        '/api/v1/boards/999999999',
        {
          name: 'Ghost Board',
        },
        testToken
      )

      assert.strictEqual(result.status, 404)
    })
  })

  describe('DELETE /api/v1/boards/:id', () => {
    it('should delete board', async () => {
      const board = await prisma.board.create({
        data: {
          name: 'Board to Delete',
          userId: testUser.id,
          position: 100,
        },
      })

      const result = await makeRequest('DELETE', `/api/v1/boards/${board.id}`)

      assert.strictEqual(result.status, 204)

      const deleted = await prisma.board.findUnique({
        where: { id: board.id },
      })
      assert.strictEqual(deleted, null)
    })
  })
})
