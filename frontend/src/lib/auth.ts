const TOKEN_KEY = 'clawdeck_jwt_token'
const USER_KEY = 'clawdeck_user'

export function getToken (): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken (token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken (): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

interface StoredUser {
  id: string
  emailAddress: string
  admin: boolean
  agentAutoMode?: boolean
  agentName?: string | null
  agentEmoji?: string | null
  avatarUrl?: string | null
}

export function getStoredUser (): StoredUser | null {
  const stored = localStorage.getItem(USER_KEY)
  if (!stored) return null

  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export function setStoredUser (user: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}
