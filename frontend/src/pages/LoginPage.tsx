import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Card, CardContent } from '../components/ui'

// Dev mode check - VITE_DEV_LOGIN must be set to 'true'
const DEV_LOGIN_ENABLED = import.meta.env.VITE_DEV_LOGIN === 'true'

interface LocationState {
  from?: {
    pathname: string
  }
}

export default function LoginPage () {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as LocationState)?.from?.pathname || '/dashboard'

  async function handleSubmit (e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await login(email, password)

    if (result.success) {
      navigate(from, { replace: true })
    } else {
      setError(result.error || 'Login failed')
      setLoading(false)
    }
  }

  async function handleDevLogin () {
    setEmail('admin')
    setPassword('changeme')
    setError(null)
    setLoading(true)

    const result = await login('admin', 'changeme')

    if (result.success) {
      navigate(from, { replace: true })
    } else {
      setError(result.error || 'Dev login failed')
      setLoading(false)
    }
  }

  return (
    <div className='min-h-screen bg-slate-900 flex items-center justify-center p-4'>
      <div className='w-full max-w-md'>
        <Card>
          <CardContent className='p-8'>
            {/* Logo */}
            <div className='text-center mb-8'>
              <h1 className='text-3xl font-bold text-white flex items-center justify-center gap-3'>
                <span className='text-4xl'>🦀</span>
                ClawDeck
              </h1>
              <p className='text-slate-400 mt-2'>Sign in to your account</p>
            </div>

            {/* Error Message */}
            {error && (
              <div
                data-testid='login-error'
                className='mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm'
              >
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className='space-y-4'>
              <div>
                <label htmlFor='email' className='block text-sm font-medium text-slate-300 mb-2'>
                  Email
                </label>
                <Input
                  id='email'
                  type='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete='email'
                  placeholder='you@example.com'
                  data-testid='email-input'
                />
              </div>

              <div>
                <label htmlFor='password' className='block text-sm font-medium text-slate-300 mb-2'>
                  Password
                </label>
                <Input
                  id='password'
                  type='password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete='current-password'
                  placeholder='••••••••'
                  data-testid='password-input'
                />
              </div>

              <Button type='submit' loading={loading} className='w-full' data-testid='login-button'>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>

              {/* Dev Login Button */}
              {DEV_LOGIN_ENABLED && (
                <Button
                  type='button'
                  variant='secondary'
                  onClick={handleDevLogin}
                  loading={loading}
                  className='w-full bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/30'
                  data-testid='dev-login-button'
                >
                  🔧 Dev Login (admin/admin)
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
