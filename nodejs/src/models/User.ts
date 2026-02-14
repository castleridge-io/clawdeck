import { query } from '../db/connection.js'
import bcrypt from 'bcrypt'
import type { QueryResultRow } from 'pg'

const SALT_ROUNDS = 12

interface UserRow extends QueryResultRow {
  id: string
  email_address: string
  password_digest: string | null
  provider: string | null
  uid: string | null
  admin: boolean
  created_at: Date
  updated_at: Date
}

interface CreateUserParams {
  email: string
  password?: string
  provider?: string
  uid?: string
  admin?: boolean
}

interface FindAllOptions {
  adminOnly?: boolean
  limit?: number
}

export class User {
  static async findByEmail (email: string): Promise<UserRow | null> {
    const result = await query<UserRow>('SELECT * FROM users WHERE email_address = $1', [email])
    return result.rows[0] || null
  }

  static async findById (id: string | number): Promise<UserRow | null> {
    const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0] || null
  }

  static async findByProviderUid (provider: string, uid: string): Promise<UserRow | null> {
    const result = await query<UserRow>('SELECT * FROM users WHERE provider = $1 AND uid = $2', [
      provider,
      uid,
    ])
    return result.rows[0] || null
  }

  static async create ({ email, password, provider, uid, admin = false }: CreateUserParams): Promise<UserRow> {
    let passwordDigest: string | null = null

    if (password) {
      passwordDigest = await bcrypt.hash(password, SALT_ROUNDS)
    }

    const result = await query<UserRow>(
      `INSERT INTO users (email_address, password_digest, provider, uid, admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, passwordDigest, provider, uid, admin]
    )

    return result.rows[0]
  }

  static async update (id: string | number, updates: Record<string, unknown>): Promise<UserRow | null> {
    const fields: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${this._camelToSnake(key)} = $${paramIndex}`)
        values.push(value)
        paramIndex++
      }
    }

    if (fields.length === 0) {
      return await this.findById(id as string)
    }

    values.push(id)

    const result = await query<UserRow>(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    return result.rows[0]
  }

  static async verifyPassword (user: UserRow, password: string): Promise<boolean> {
    if (!user.password_digest) {
      return false
    }
    return await bcrypt.compare(password, user.password_digest)
  }

  static _camelToSnake (str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  }

  static _snakeToCamel (str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  }

  static _toCamelCase (obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this._toCamelCase(item))
    }

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[this._snakeToCamel(key)] = this._toCamelCase(value)
    }
    return result
  }

  static async findAll (options: FindAllOptions = {}): Promise<unknown[]> {
    let sql = 'SELECT * FROM users'
    const params: unknown[] = []

    if (options.adminOnly) {
      sql += ' WHERE admin = TRUE'
    }

    sql += ' ORDER BY created_at DESC'

    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`
      params.push(options.limit)
    }

    const result = await query<UserRow>(sql, params)
    return result.rows.map((row) => this._toCamelCase(row))
  }
}
