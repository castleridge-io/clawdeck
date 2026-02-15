import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { createRateLimiter } from '../../src/middleware/rateLimiter.middleware.ts'

describe('Rate Limiter', () => {
  let rateLimiter

  before(async () => {
    rateLimiter = createRateLimiter()
  })

  describe('createRateLimiter', () => {
    it('should create a rate limiter with default options', () => {
      const limiter = rateLimiter

      assert.ok(limiter)
      assert.ok(limiter.getDefaultOptions)
      assert.ok(limiter.getStrictOptions)
      assert.ok(limiter.getAuthOptions)
    })

    it('should return default options for general API use', () => {
      const options = rateLimiter.getDefaultOptions()

      assert.ok(options)
      assert.ok(options.max)
      assert.ok(options.timeWindow)
      assert.ok(options.max >= 60) // At least 60 requests per minute
    })

    it('should return strict options for sensitive endpoints', () => {
      const options = rateLimiter.getStrictOptions()

      assert.ok(options)
      assert.ok(options.max)
      assert.ok(options.timeWindow)
      assert.ok(options.max <= 20) // At most 20 requests per window for strict
    })

    it('should return auth-specific options', () => {
      const options = rateLimiter.getAuthOptions()

      assert.ok(options)
      assert.ok(options.max)
      assert.ok(options.timeWindow)
      // Auth should be stricter than default
      assert.ok(options.max < rateLimiter.getDefaultOptions().max)
    })
  })

  describe('getClientIdentifier', () => {
    it('should identify client by IP address', () => {
      const mockRequest = {
        ip: '192.168.1.1',
        headers: {},
        user: null,
      }

      const identifier = rateLimiter.getClientIdentifier(mockRequest)

      assert.strictEqual(identifier, '192.168.1.1')
    })

    it('should identify client by user ID if authenticated', () => {
      const mockRequest = {
        ip: '192.168.1.1',
        headers: {},
        user: { id: 'user-123' },
      }

      const identifier = rateLimiter.getClientIdentifier(mockRequest)

      assert.strictEqual(identifier, 'user:user-123')
    })

    it('should use X-Forwarded-For if behind proxy', () => {
      const mockRequest = {
        ip: '10.0.0.1',
        headers: {
          'x-forwarded-for': '203.0.113.1, 70.41.3.18',
        },
        user: null,
      }

      const identifier = rateLimiter.getClientIdentifier(mockRequest)

      assert.strictEqual(identifier, '203.0.113.1')
    })
  })

  describe('custom rate limit configs', () => {
    it('should provide per-endpoint rate limits', () => {
      const configs = rateLimiter.getEndpointConfigs()

      assert.ok(configs)
      // Auth endpoints should have strict limits
      assert.ok(configs.auth)
      // Public endpoints should have relaxed limits
      assert.ok(configs.public)
    })

    it('should have stricter limits for login endpoint', () => {
      const configs = rateLimiter.getEndpointConfigs()
      const loginConfig = configs.auth.login

      assert.ok(loginConfig)
      assert.ok(loginConfig.max <= 10) // Very strict for login
      assert.ok(loginConfig.timeWindow)
    })

    it('should have appropriate limits for API endpoints', () => {
      const configs = rateLimiter.getEndpointConfigs()
      const apiConfig = configs.api.default

      assert.ok(apiConfig)
      assert.ok(apiConfig.max >= 30) // More lenient for API use
    })
  })

  describe('whitelist', () => {
    it('should skip rate limiting for whitelisted IPs', () => {
      const whitelist = rateLimiter.getWhitelist()

      assert.ok(Array.isArray(whitelist))
      // Localhost should typically be whitelisted in dev
      assert.ok(whitelist.includes('127.0.0.1') || whitelist.includes('::1'))
    })

    it('should check if IP is whitelisted', () => {
      assert.ok(rateLimiter.isWhitelisted('127.0.0.1'))
      assert.ok(!rateLimiter.isWhitelisted('8.8.8.8'))
    })
  })

  describe('forEndpoint', () => {
    it('should return rate limit config for auth login', () => {
      const config = rateLimiter.forEndpoint('auth', 'login')

      assert.ok(config)
      assert.ok(config.rateLimit)
      assert.ok(config.rateLimit.max <= 10)
    })

    it('should return default config for unknown endpoint', () => {
      const config = rateLimiter.forEndpoint('api', 'unknown')

      assert.ok(config)
      assert.ok(config.rateLimit)
      assert.ok(config.rateLimit.max >= 30)
    })
  })

  describe('custom', () => {
    it('should create custom rate limit config', () => {
      const config = rateLimiter.custom(50, '5 minutes')

      assert.ok(config)
      assert.strictEqual(config.rateLimit.max, 50)
      assert.strictEqual(config.rateLimit.timeWindow, '5 minutes')
    })
  })
})
