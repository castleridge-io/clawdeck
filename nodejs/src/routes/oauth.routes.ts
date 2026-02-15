import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createOAuthService, OAuthProfile, OAuthProvider } from '../services/oauth.service.js'
import type { User } from '@prisma/client'
import '@fastify/cookie'

interface GoogleCallbackQuery {
  code: string
  state: string
  error?: string
}

interface GitHubCallbackQuery {
  code: string
  state: string
  error?: string
  error_description?: string
}

interface ProviderParams {
  provider: OAuthProvider
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
}

interface GitHubTokenResponse {
  access_token: string
  error?: string
  errorDescription?: string
}

interface GoogleProfile {
  id: string
  name: string
  email: string
  verified_email: boolean
  picture?: string
}

interface GitHubEmail {
  email: string
  verified: boolean
  primary: boolean
}

interface GitHubUser {
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
}

async function exchangeGoogleCode (code: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = `${process.env.API_URL ?? 'http://localhost:3335'}/api/v1/oauth/google/callback`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      client_id: clientId ?? '',
      client_secret: clientSecret ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google token exchange failed: ${error}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

async function getGoogleProfile (accessToken: string): Promise<OAuthProfile> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch Google profile')
  }

  const data = await response.json() as GoogleProfile

  return {
    id: data.id,
    displayName: data.name,
    emails: [{ value: data.email, verified: data.verified_email }],
    photos: data.picture ? [{ value: data.picture }] : [],
    _json: data as unknown as Record<string, unknown>
  }
}

async function exchangeGitHubCode (code: string): Promise<GitHubTokenResponse> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      code,
      client_id: clientId ?? '',
      client_secret: clientSecret ?? ''
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GitHub token exchange failed: ${error}`)
  }

  const data = await response.json() as GitHubTokenResponse

  if (data.error) {
    throw new Error(`GitHub token exchange error: ${data.errorDescription ?? data.error}`)
  }

  return data
}

async function getGitHubProfile (accessToken: string): Promise<OAuthProfile> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ClawDeck-OAuth'
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch GitHub profile')
  }

  const data = await response.json() as GitHubUser

  // Also fetch emails
  const emailsResponse = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ClawDeck-OAuth'
    }
  })

  let emails: Array<{ value: string; verified: boolean }> = []
  if (emailsResponse.ok) {
    const githubEmails = await emailsResponse.json() as GitHubEmail[]
    emails = githubEmails.map((e) => ({ value: e.email, verified: e.verified }))
  } else {
    // Fallback to public email
    emails = data.email ? [{ value: data.email, verified: false }] : []
  }

  return {
    id: data.id,
    username: data.login,
    displayName: data.name ?? data.login,
    emails,
    photos: data.avatar_url ? [{ value: data.avatar_url }] : [],
    _json: data as unknown as Record<string, unknown>
  }
}

export async function oauthRoutes (fastify: FastifyInstance): Promise<void> {
  const oauthService = createOAuthService()

  /**
   * Initiate Google OAuth flow
   * GET /api/v1/oauth/google
   */
  fastify.get(
    '/google',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const state = await oauthService.generateOAuthState()

      // Build Google OAuth URL
      const clientId = process.env.GOOGLE_CLIENT_ID
      const redirectUri = `${process.env.API_URL ?? 'http://localhost:3335'}/api/v1/oauth/google/callback`
      const scope = 'email profile'

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', clientId ?? '')
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', scope)
      authUrl.searchParams.set('state', state)

      // Store state in cookie for validation
      reply.setCookie('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600 // 10 minutes
      })

      return reply.redirect(authUrl.toString())
    }
  )

  /**
   * Google OAuth callback
   * GET /api/v1/oauth/google/callback
   */
  fastify.get<{ Querystring: GoogleCallbackQuery }>(
    '/google/callback',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            state: { type: 'string' },
            error: { type: 'string' }
          },
          required: ['code', 'state']
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: GoogleCallbackQuery }>, reply: FastifyReply) => {
      const { code, state, error } = request.query

      if (error) {
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}/login?error=${encodeURIComponent(error)}`
        )
      }

      // Verify state
      const cookieState = request.cookies.oauth_state
      const isValidState = await oauthService.verifyOAuthState(state)

      if (!isValidState || state !== cookieState) {
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}/login?error=invalid_state`
        )
      }

      // Clear state cookie
      reply.clearCookie('oauth_state')

      try {
        // Exchange code for tokens
        const tokenResponse = await exchangeGoogleCode(code)

        // Get user profile from Google
        const profile = await getGoogleProfile(tokenResponse.access_token)

        // Find or create user
        const result = await oauthService.findOrCreateUserFromGoogle(
          profile,
          tokenResponse.access_token,
          tokenResponse.refresh_token ?? null
        )

        // Generate JWT token
        const token = fastify.jwt.sign({
          userId: result.user.id,
          email: result.user.emailAddress,
          organizationId: result.organization?.id
        })

        // Set JWT cookie
        reply.setCookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        })

        // Redirect to frontend with token
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}?token=${token}&newUser=${result.isNewUser}`
        )
      } catch (err) {
        request.log.error({ err }, 'Google OAuth callback failed')
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}/login?error=oauth_failed`
        )
      }
    }
  )

  /**
   * Initiate GitHub OAuth flow
   * GET /api/v1/oauth/github
   */
  fastify.get(
    '/github',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute'
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const state = await oauthService.generateOAuthState()

      // Build GitHub OAuth URL
      const clientId = process.env.GITHUB_CLIENT_ID
      const redirectUri = `${process.env.API_URL ?? 'http://localhost:3335'}/api/v1/oauth/github/callback`
      const scope = 'user:email'

      const authUrl = new URL('https://github.com/login/oauth/authorize')
      authUrl.searchParams.set('client_id', clientId ?? '')
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('scope', scope)
      authUrl.searchParams.set('state', state)

      // Store state in cookie for validation
      reply.setCookie('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600 // 10 minutes
      })

      return reply.redirect(authUrl.toString())
    }
  )

  /**
   * GitHub OAuth callback
   * GET /api/v1/oauth/github/callback
   */
  fastify.get<{ Querystring: GitHubCallbackQuery }>(
    '/github/callback',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            state: { type: 'string' },
            error: { type: 'string' },
            errorDescription: { type: 'string' }
          },
          required: ['code', 'state']
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: GitHubCallbackQuery }>, reply: FastifyReply) => {
      const { code, state, error, error_description: errorDescription } = request.query

      if (error) {
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}/login?error=${encodeURIComponent(errorDescription ?? error)}`
        )
      }

      // Verify state
      const cookieState = request.cookies.oauth_state
      const isValidState = await oauthService.verifyOAuthState(state)

      if (!isValidState || state !== cookieState) {
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}/login?error=invalid_state`
        )
      }

      // Clear state cookie
      reply.clearCookie('oauth_state')

      try {
        // Exchange code for tokens
        const tokenResponse = await exchangeGitHubCode(code)

        // Get user profile from GitHub
        const profile = await getGitHubProfile(tokenResponse.access_token)

        // Find or create user
        const result = await oauthService.findOrCreateUserFromGitHub(
          profile,
          tokenResponse.access_token,
          null // GitHub doesn't provide refresh tokens
        )

        // Generate JWT token
        const token = fastify.jwt.sign({
          userId: result.user.id,
          email: result.user.emailAddress,
          organizationId: result.organization?.id
        })

        // Set JWT cookie
        reply.setCookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        })

        // Redirect to frontend with token
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}?token=${token}&newUser=${result.isNewUser}`
        )
      } catch (err) {
        request.log.error({ err }, 'GitHub OAuth callback failed')
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? 'http://localhost:3002'}/login?error=oauth_failed`
        )
      }
    }
  )

  /**
   * Get linked OAuth accounts for current user
   * GET /api/v1/oauth/accounts
   */
  fastify.get(
    '/accounts',
    {
      preHandler: fastify.authenticate
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as User
      const accounts = await oauthService.getLinkedAccounts(user.id.toString())

      return {
        success: true,
        data: accounts
      }
    }
  )

  /**
   * Unlink an OAuth provider
   * DELETE /api/v1/oauth/:provider
   */
  fastify.delete<{ Params: ProviderParams }>(
    '/:provider',
    {
      preHandler: fastify.authenticate,
      schema: {
        params: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['google', 'github'] }
          },
          required: ['provider']
        }
      }
    },
    async (request: FastifyRequest<{ Params: ProviderParams }>, reply: FastifyReply) => {
      const { provider } = request.params
      const user = request.user as User

      try {
        await oauthService.unlinkOAuthAccount(user.id.toString(), provider)

        return {
          success: true,
          message: `${provider} account unlinked successfully`
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('last login method')) {
          return reply.status(400).send({ error: err.message })
        }
        throw err
      }
    }
  )
}
