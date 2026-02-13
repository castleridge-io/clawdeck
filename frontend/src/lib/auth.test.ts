import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getToken, setToken, clearToken, getStoredUser, setStoredUser } from '../lib/auth'

describe('auth module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('getToken', () => {
    it('returns null when no token is stored', () => {
      expect(getToken()).toBeNull()
    })

    it('returns the stored token', () => {
      localStorage.setItem('clawdeck_jwt_token', 'test-token')
      expect(getToken()).toBe('test-token')
    })
  })

  describe('setToken', () => {
    it('stores the token in localStorage', () => {
      setToken('my-jwt-token')
      expect(localStorage.getItem('clawdeck_jwt_token')).toBe('my-jwt-token')
    })
  })

  describe('clearToken', () => {
    it('removes token and user from localStorage', () => {
      localStorage.setItem('clawdeck_jwt_token', 'token')
      localStorage.setItem('clawdeck_user', JSON.stringify({ id: '1' }))

      clearToken()

      expect(localStorage.getItem('clawdeck_jwt_token')).toBeNull()
      expect(localStorage.getItem('clawdeck_user')).toBeNull()
    })
  })

  describe('getStoredUser', () => {
    it('returns null when no user is stored', () => {
      expect(getStoredUser()).toBeNull()
    })

    it('returns parsed user object', () => {
      const user = {
        id: '1',
        emailAddress: 'test@example.com',
        admin: false,
      }
      localStorage.setItem('clawdeck_user', JSON.stringify(user))

      expect(getStoredUser()).toEqual(user)
    })

    it('returns null for invalid JSON', () => {
      localStorage.setItem('clawdeck_user', 'not-valid-json')
      expect(getStoredUser()).toBeNull()
    })
  })

  describe('setStoredUser', () => {
    it('stores user as JSON string', () => {
      const user = {
        id: '2',
        emailAddress: 'admin@example.com',
        admin: true,
        agentName: 'Bot',
        agentEmoji: '🤖',
      }

      setStoredUser(user)

      const stored = localStorage.getItem('clawdeck_user')
      expect(stored).toBe(JSON.stringify(user))
    })
  })
})
