import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getToken, setToken, clearToken, getStoredUser, setStoredUser } from '../lib/auth'
import type { User, AuthContextValue } from '../types'

const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = '/api/v1'

interface AuthProviderProps {
  children: ReactNode
}

interface LoginResult {
  success: boolean
  error?: string
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(getStoredUser())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const token = getToken()
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const userData = await response.json() as User
          setUser(userData)
          setStoredUser(userData)
        } else {
          clearToken()
          setUser(null)
        }
      } catch (err) {
        console.error('Failed to verify auth:', err)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = useCallback(async (emailAddress: string, password: string): Promise<LoginResult> => {
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailAddress, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      setToken(data.token)
      setUser(data.user)
      setStoredUser(data.user)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    const token = getToken()

    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
      } catch (err) {
        console.error('Logout request failed:', err)
      }
    }

    clearToken()
    setUser(null)
  }, [])

  const value: AuthContextValue = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user && !!getToken(),
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
