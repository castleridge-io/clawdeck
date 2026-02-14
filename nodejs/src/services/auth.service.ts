import bcrypt from 'bcrypt'
import type { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { prisma } from '../db/prisma.js'
import type { User, Session, ApiToken, Board, Prisma } from '@prisma/client'

const SALT_ROUNDS = 12
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const JWT_TTL_SECONDS = 24 * 60 * 60 // 24 hours

interface JWTPayload {
  sessionId: string
}

interface RegisterData {
  emailAddress: string
  password?: string
  agentAutoMode?: boolean
  agentName?: string | null
  agentEmoji?: string | null
}

interface UpdateProfileData {
  emailAddress?: string
  agentAutoMode?: boolean
  agentName?: string | null
  agentEmoji?: string | null
  avatarUrl?: string | null
}

interface UserWithCounts {
  id: string
  emailAddress: string
  admin: boolean
  agentAutoMode: boolean
  agentName: string | null
  agentEmoji: string | null
  agentLastActiveAt: Date | null
  avatarUrl: string | null
  createdAt: Date
  _count: {
    boards: number
    tasks: number
  }
}

interface UserListResult {
  users: UserWithCounts[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface UserStats {
  totalUsers: number
  totalBoards: number
  totalTasks: number
  activeUsers: number
}

interface SessionWithUser extends Session {
  user: User
}

interface ApiTokenWithUser extends ApiToken {
  user: User
}

export class AuthService {
  private fastify: FastifyInstance
  private prisma: typeof prisma

  constructor (fastify: FastifyInstance) {
    this.fastify = fastify
    this.prisma = prisma
  }

  async hashPassword (password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS)
  }

  async verifyPassword (password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  generateSecureToken (): string {
    return crypto.randomBytes(32).toString('base64url')
  }

  generateApiToken (): string {
    return crypto.randomBytes(32).toString('hex')
  }

  async createSession (
    userId: bigint | string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<string> {
    const session = await this.prisma.session.create({
      data: {
        userId: BigInt(userId),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    })

    return session.id.toString()
  }

  async deleteSession (sessionId: string): Promise<void> {
    await this.prisma.session.delete({
      where: { id: BigInt(sessionId) },
    })
  }

  async deleteAllUserSessions (userId: string | bigint): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId: BigInt(userId) },
    })
  }

  async getSession (sessionId: string): Promise<SessionWithUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: BigInt(sessionId) },
      include: { user: true },
    })

    if (!session) {
      return null
    }

    const sessionAge = Date.now() - session.createdAt.getTime()
    if (sessionAge > SESSION_TTL_MS) {
      await this.deleteSession(sessionId)
      return null
    }

    return session as SessionWithUser
  }

  generateSessionToken (sessionId: string): string {
    return this.fastify.jwt.sign(
      { sessionId: sessionId.toString() },
      { expiresIn: JWT_TTL_SECONDS }
    )
  }

  async verifySessionToken (token: string): Promise<User | null> {
    try {
      const payload = this.fastify.jwt.verify<JWTPayload>(token)
      const session = await this.getSession(payload.sessionId)

      if (!session) {
        return null
      }

      return session.user
    } catch {
      return null
    }
  }

  async verifyApiToken (token: string): Promise<User | null> {
    if (!token) {
      return null
    }

    const apiToken = await this.prisma.apiToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!apiToken) {
      return null
    }

    await this.prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date() },
    })

    return (apiToken as ApiTokenWithUser).user
  }

  async verifyAgentToken (token: string): Promise<User | null> {
    if (!token) {
      return null
    }

    const apiToken = await this.prisma.apiToken.findFirst({
      where: {
        token,
        name: 'Default',
      },
      include: { user: true },
    })

    if (!apiToken) {
      return null
    }

    await this.prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date() },
    })

    return (apiToken as ApiTokenWithUser).user
  }

  async register (
    emailAddress: string,
    password?: string,
    agentAutoMode: boolean = true,
    agentName: string | null = null,
    agentEmoji: string | null = null
  ): Promise<{ user: User; apiToken: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { emailAddress: emailAddress.toLowerCase() },
    })

    if (existingUser) {
      throw new Error('User already exists')
    }

    if (password && password.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }

    const passwordDigest = password ? await this.hashPassword(password) : null

    const user = await this.prisma.user.create({
      data: {
        emailAddress: emailAddress.toLowerCase().trim(),
        passwordDigest,
        agentAutoMode,
        agentName,
        agentEmoji,
      },
    })

    // Create default API token for the user
    const apiToken = await this.prisma.apiToken.create({
      data: {
        userId: user.id,
        name: 'Default',
        token: this.generateApiToken(),
      },
    })

    await this.createOnboardingBoard(user.id)

    return { user, apiToken: apiToken.token }
  }

  async login (
    emailAddress: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ user: User; token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { emailAddress: emailAddress.toLowerCase() },
    })

    if (!user || !user.passwordDigest) {
      throw new Error('Invalid credentials')
    }

    const isValid = await this.verifyPassword(password, user.passwordDigest)

    if (!isValid) {
      throw new Error('Invalid credentials')
    }

    const sessionId = await this.createSession(user.id, ipAddress, userAgent)
    const token = this.generateSessionToken(sessionId)

    return { user, token }
  }

  async loginWithApiToken (
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ user: User; token: string }> {
    const user = await this.verifyApiToken(token)

    if (!user) {
      throw new Error('Invalid token')
    }

    const sessionId = await this.createSession(user.id, ipAddress, userAgent)
    const sessionToken = this.generateSessionToken(sessionId)

    return { user, token: sessionToken }
  }

  async logout (sessionId: string): Promise<void> {
    await this.deleteSession(sessionId)
  }

  async getUserById (userId: string | bigint): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    })
  }

  async updateProfile (userId: string | bigint, data: UpdateProfileData): Promise<User> {
    const updateData: Prisma.UserUpdateInput = {}

    if (data.emailAddress) {
      updateData.emailAddress = data.emailAddress.toLowerCase().trim()
    }

    if (data.agentAutoMode !== undefined) {
      updateData.agentAutoMode = data.agentAutoMode
    }

    if (data.agentName !== undefined) {
      updateData.agentName = data.agentName ?? null
    }

    if (data.agentEmoji !== undefined) {
      updateData.agentEmoji = data.agentEmoji ?? null
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl ?? null
    }

    return this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: updateData,
    })
  }

  async updatePassword (userId: string | bigint, newPassword: string): Promise<User> {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters')
    }

    const passwordDigest = await this.hashPassword(newPassword)

    return this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: { passwordDigest },
    })
  }

  async getApiToken (userId: string | bigint): Promise<ApiToken> {
    let apiToken = await this.prisma.apiToken.findFirst({
      where: { userId: BigInt(userId), name: 'Default' },
    })

    if (!apiToken) {
      apiToken = await this.prisma.apiToken.create({
        data: {
          userId: BigInt(userId),
          name: 'Default',
          token: this.generateApiToken(),
        },
      })
    }

    return apiToken
  }

  async regenerateApiToken (userId: string | bigint): Promise<ApiToken> {
    await this.prisma.apiToken.deleteMany({
      where: {
        userId: BigInt(userId),
        name: 'Default',
      },
    })

    return this.prisma.apiToken.create({
      data: {
        userId: BigInt(userId),
        name: 'Default',
        token: this.generateApiToken(),
      },
    })
  }

  async createOnboardingBoard (userId: bigint): Promise<Board | void> {
    const existingBoards = await this.prisma.board.count({
      where: { userId: BigInt(userId) },
    })

    if (existingBoards > 0) {
      return
    }

    return this.prisma.board.create({
      data: {
        name: 'Getting Started',
        icon: '🚀',
        color: 'blue',
        position: 0,
        userId: BigInt(userId),
        organizationId: BigInt(1), // Default organization
      },
    })
  }

  async getAllUsers (page: number = 1, limit: number = 50): Promise<UserListResult> {
    const skip = (page - 1) * limit

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          emailAddress: true,
          admin: true,
          agentAutoMode: true,
          agentName: true,
          agentEmoji: true,
          agentLastActiveAt: true,
          avatarUrl: true,
          createdAt: true,
          _count: {
            select: {
              boards: true,
              tasks: true,
            },
          },
        },
      }),
      this.prisma.user.count(),
    ])

    return {
      users: users.map((u) => ({
        ...u,
        id: u.id.toString(),
        _count: {
          boards: u._count.boards,
          tasks: u._count.tasks,
        },
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async getUserStats (): Promise<UserStats> {
    const [totalUsers, totalBoards, totalTasks, activeUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.board.count(),
      this.prisma.task.count(),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ])

    return {
      totalUsers,
      totalBoards,
      totalTasks,
      activeUsers,
    }
  }
}

export function createAuthService (fastify: FastifyInstance): AuthService {
  return new AuthService(fastify)
}
