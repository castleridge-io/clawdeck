// Shared test helpers for integration tests
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { prisma } from '../src/db/prisma.js'

// Get the project root directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

// Run migrations once before all tests
let migrationsRan = false

export async function setupTestDatabase (): Promise<void> {
  if (migrationsRan) return

  console.log('[test-setup] Running Prisma migrations...')
  try {
    // Generate Prisma client
    execSync('npx prisma generate', {
      cwd: projectRoot,
      stdio: 'inherit',
    })

    // Run migrations with deploy
    execSync('npx prisma migrate deploy', {
      cwd: projectRoot,
      stdio: 'inherit',
    })

    migrationsRan = true
    console.log('[test-setup] Migrations completed successfully')
  } catch (error) {
    console.error('[test-setup] Migration failed:', error)
    throw error
  }
}

interface CreateTestOrganizationOptions {
  name?: string
  slug?: string
}

interface CreateTestUserOptions {
  emailAddress?: string
  passwordDigest?: string
  admin?: boolean
  agentAutoMode?: boolean
  agentName?: string | null
  agentEmoji?: string | null
  currentOrganizationId?: bigint | null
}

interface CreateTestAgentOptions {
  name?: string
  slug?: string
  emoji?: string
  color?: string
  isActive?: boolean
  organizationId: bigint
}

interface CreateTestBoardOptions {
  name?: string
  icon?: string
  color?: string
  position?: number
  userId: bigint
  organizationId: bigint
}

interface CreateTestApiTokenOptions {
  token?: string
  name?: string
  userId: bigint
}

type CreateTestBoardOverrides = Omit<CreateTestBoardOptions, 'userId' | 'organizationId'>
type CreateTestAgentOverrides = Omit<CreateTestAgentOptions, 'organizationId'>
type CreateTestApiTokenOverrides = Omit<CreateTestApiTokenOptions, 'userId'>

export async function createTestOrganization (overrides: CreateTestOrganizationOptions = {}): Promise<any> {
  return prisma.organization.create({
    data: {
      name: 'Test Organization',
      slug: `test-org-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      ...overrides,
    },
  })
}

export async function createTestUser (organizationId: bigint, overrides: CreateTestUserOptions = {}): Promise<any> {
  return prisma.user.create({
    data: {
      emailAddress: `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
      passwordDigest: 'hash',
      agentAutoMode: true,
      agentName: 'TestAgent',
      agentEmoji: '🤖',
      currentOrganizationId: organizationId,
      ...overrides,
    },
  })
}

export async function createTestAgent (organizationId: bigint, overrides: CreateTestAgentOverrides = {}): Promise<any> {
  return prisma.agent.create({
    data: {
      name: 'Test Agent',
      slug: `test-agent-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      emoji: '🤖',
      color: 'gray',
      organizationId,
      ...overrides,
    },
  })
}

export async function createTestBoard (userId: bigint, organizationId: bigint, overrides: CreateTestBoardOverrides = {}): Promise<any> {
  return prisma.board.create({
    data: {
      name: 'Test Board',
      userId,
      organizationId,
      position: 0,
      ...overrides,
    },
  })
}

export async function createTestApiToken (userId: bigint, overrides: CreateTestApiTokenOverrides = {}): Promise<any> {
  const token = `cd_test_${Date.now()}_${Math.random().toString(36).substring(7)}`
  return prisma.apiToken.create({
    data: {
      token,
      name: 'Test Token',
      userId,
      ...overrides,
    },
  })
}

export async function cleanupTestData (): Promise<void> {
  // Clean up in reverse order of dependencies
  await prisma.story.deleteMany({})
  await prisma.step.deleteMany({})
  await prisma.run.deleteMany({})
  await prisma.workflow.deleteMany({})
  await prisma.taskActivity.deleteMany({})
  await prisma.task.deleteMany({})
  await prisma.board.deleteMany({})
  await prisma.apiToken.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.organization.deleteMany({})
  await prisma.agent.deleteMany({})
}
