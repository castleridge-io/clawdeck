import { query } from '../db/connection.js'
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export class User {
  static async findByEmail (email) {
    const result = await query('SELECT * FROM users WHERE email_address = $1', [email])
    return result.rows[0] || null
  }

  static async findById (id) {
    const result = await query('SELECT * FROM users WHERE id = $1', [id])
    return result.rows[0] || null
  }

  static async findByProviderUid (provider, uid) {
    const result = await query('SELECT * FROM users WHERE provider = $1 AND uid = $2', [
      provider,
      uid,
    ])
    return result.rows[0] || null
  }

  static async create ({ email, password, provider, uid, admin = false }) {
    let passwordDigest = null

    if (password) {
      passwordDigest = await bcrypt.hash(password, SALT_ROUNDS)
    }

    const result = await query(
      `INSERT INTO users (email_address, password_digest, provider, uid, admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, passwordDigest, provider, uid, admin]
    )

    return result.rows[0]
  }

  static async update (id, updates) {
    const fields = []
    const values = []
    let paramIndex = 1

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${this._camelToSnake(key)} = $${paramIndex}`)
        values.push(value)
        paramIndex++
      }
    }

    if (fields.length === 0) {
      return await this.findById(id)
    }

    values.push(id)

    const result = await query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    return result.rows[0]
  }

  static async verifyPassword (user, password) {
    if (!user.password_digest) {
      return false
    }
    return await bcrypt.compare(password, user.password_digest)
  }

  static _camelToSnake (str) {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  }

  static _snakeToCamel (str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  }

  static _toCamelCase (obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this._toCamelCase(item))
    }

    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[this._snakeToCamel(key)] = this._toCamelCase(value)
    }
    return result
  }

  static async findAll (options = {}) {
    let sql = 'SELECT * FROM users'
    const params = []

    if (options.adminOnly) {
      sql += ' WHERE admin = TRUE'
    }

    sql += ' ORDER BY created_at DESC'

    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`
      params.push(options.limit)
    }

    const result = await query(sql, params)
    return result.rows.map((row) => this._toCamelCase(row))
  }
}
