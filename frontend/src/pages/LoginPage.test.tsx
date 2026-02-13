import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import LoginPage from './LoginPage'

// Mock useAuth
const mockLogin = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}))

// Store original env
const originalEnv = import.meta.env.VITE_DEV_LOGIN

function renderLoginPage () {
  return render(
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original env
    vi.stubEnv('VITE_DEV_LOGIN', originalEnv)
  })

  it('renders login form', () => {
    renderLoginPage()

    expect(screen.getByText('ClawDeck')).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('submits form with email and password', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce({ success: true })

    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123')
  })

  it('shows error message on login failure', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce({ success: false, error: 'Invalid credentials' })

    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('disables button while loading', async () => {
    const user = userEvent.setup()
    mockLogin.mockImplementation(() => new Promise(() => {})) // Never resolves

    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
    })
  })

  it('requires email and password fields', () => {
    renderLoginPage()

    expect(screen.getByLabelText(/email/i)).toBeRequired()
    expect(screen.getByLabelText(/password/i)).toBeRequired()
  })

  describe('Dev Login', () => {
    it('shows dev login button when VITE_DEV_LOGIN is true', () => {
      vi.stubEnv('VITE_DEV_LOGIN', 'true')
      renderLoginPage()

      expect(screen.getByTestId('dev-login-button')).toBeInTheDocument()
      expect(screen.getByText(/dev login/i)).toBeInTheDocument()
    })

    it('hides dev login button when VITE_DEV_LOGIN is not true', () => {
      vi.stubEnv('VITE_DEV_LOGIN', 'false')
      renderLoginPage()

      expect(screen.queryByTestId('dev-login-button')).not.toBeInTheDocument()
    })

    it('calls login with admin credentials when dev login clicked', async () => {
      vi.stubEnv('VITE_DEV_LOGIN', 'true')
      const user = userEvent.setup()
      mockLogin.mockResolvedValueOnce({ success: true })

      renderLoginPage()

      await user.click(screen.getByTestId('dev-login-button'))

      expect(mockLogin).toHaveBeenCalledWith('admin', 'admin')
    })

    it('shows error when dev login fails', async () => {
      vi.stubEnv('VITE_DEV_LOGIN', 'true')
      const user = userEvent.setup()
      mockLogin.mockResolvedValueOnce({ success: false, error: 'Dev login failed' })

      renderLoginPage()

      await user.click(screen.getByTestId('dev-login-button'))

      await waitFor(() => {
        expect(screen.getByText('Dev login failed')).toBeInTheDocument()
      })
    })
  })
})
