import { z } from 'zod'
import type { FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'

// Zod Schemas
export const RateLimitCategorySchema = z.enum(['auth', 'api', 'public', 'webhooks'])
export const RateLimitEndpointSchema = z.enum(['login', 'register', 'passwordReset', 'oauth', 'default', 'read', 'write', 'delete', 'health'])

export type RateLimitCategory = z.infer<typeof RateLimitCategorySchema>
export type RateLimitEndpoint = z.infer<typeof RateLimitEndpointSchema>

interface RateLimitConfig {
  max: number
  timeWindow: string
}

type EndpointConfigs = {
  [K in RateLimitCategory]: Record<string, RateLimitConfig>
}

/**
 * Default whitelist for rate limiting
 * These IPs bypass rate limiting
 */
const DEFAULT_WHITELIST: string[] = ['127.0.0.1', '::1', '::ffff:127.0.0.1']

/**
 * Rate limit configurations for different endpoint types
 */
const ENDPOINT_CONFIGS: EndpointConfigs = {
  auth: {
    login: { max: 5, timeWindow: '1 minute' },
    register: { max: 3, timeWindow: '1 minute' },
    passwordReset: { max: 3, timeWindow: '1 hour' },
    oauth: { max: 10, timeWindow: '1 minute' },
    default: { max: 20, timeWindow: '1 minute' }
  },
  api: {
    default: { max: 100, timeWindow: '1 minute' },
    read: { max: 200, timeWindow: '1 minute' },
    write: { max: 50, timeWindow: '1 minute' },
    delete: { max: 20, timeWindow: '1 minute' }
  },
  public: {
    health: { max: 1000, timeWindow: '1 minute' },
    default: { max: 60, timeWindow: '1 minute' }
  },
  webhooks: {
    default: { max: 1000, timeWindow: '1 minute' }
  }
}

interface RateLimitOptions {
  whitelist?: string[]
}

interface RouteRateLimitConfig {
  rateLimit: RateLimitConfig & {
    keyGenerator: (request: FastifyRequest) => string
    addHeaders?: {
      'x-ratelimit-limit': boolean
      'x-ratelimit-remaining': boolean
      'x-ratelimit-reset': boolean
      'retry-after': boolean
    }
  }
}

// Lazy load the rate-limit plugin to handle cases where it's not installed
let rateLimitPlugin: unknown = null

async function getRateLimitPlugin (): Promise<unknown> {
  if (!rateLimitPlugin) {
    try {
      const module = await import('@fastify/rate-limit')
      rateLimitPlugin = module.default
    } catch {
      // Plugin not installed, return a no-op
      rateLimitPlugin = async function noOpRateLimit () {}
    }
  }
  return rateLimitPlugin
}

export interface RateLimiter {
  plugin (): Promise<unknown>
  getDefaultOptions (): RateLimitConfig & {
    cache: number
    allowList: string[]
    skipOnError: boolean
    keyGenerator: (request: FastifyRequest) => string
    addHeaders: {
      'x-ratelimit-limit': boolean
      'x-ratelimit-remaining': boolean
      'x-ratelimit-reset': boolean
      'retry-after': boolean
    }
  }
  getStrictOptions (): RateLimitConfig & {
    cache: number
    allowList: string[]
    skipOnError: boolean
    keyGenerator: (request: FastifyRequest) => string
    addHeaders: {
      'x-ratelimit-limit': boolean
      'x-ratelimit-remaining': boolean
      'x-ratelimit-reset': boolean
      'retry-after': boolean
    }
  }
  getAuthOptions (): RateLimitConfig & {
    cache: number
    allowList: string[]
    skipOnError: boolean
    keyGenerator: (request: FastifyRequest) => string
    addHeaders: {
      'x-ratelimit-limit': boolean
      'x-ratelimit-remaining': boolean
      'x-ratelimit-reset': boolean
      'retry-after': boolean
    }
    nameSpace: string
  }
  getClientIdentifier (request: FastifyRequest): string
  getEndpointConfigs (): EndpointConfigs
  getWhitelist (): string[]
  isWhitelisted (ip: string): boolean
  forEndpoint (category: RateLimitCategory, endpoint?: string): RouteRateLimitConfig
  custom (max: number, timeWindow: string): RouteRateLimitConfig
}

export function createRateLimiter (options: RateLimitOptions = {}): RateLimiter {
  const whitelist = options.whitelist ?? DEFAULT_WHITELIST

  const baseHeaders = {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true
  }

  const getKeyGenerator = () => (request: FastifyRequest): string => {
    // Prefer user ID if authenticated
    const user = request.user as User | undefined
    if (user && user.id) {
      return `user:${user.id.toString()}`
    }

    // Check for X-Forwarded-For header (when behind proxy)
    const forwardedFor = request.headers['x-forwarded-for']
    if (forwardedFor && typeof forwardedFor === 'string') {
      // Take the first IP in the chain (original client)
      const ips = forwardedFor.split(',').map((ip) => ip.trim())
      if (ips.length > 0) {
        return ips[0]
      }
    }

    // Fall back to direct IP
    return request.ip
  }

  return {
    plugin () {
      return getRateLimitPlugin()
    },

    getDefaultOptions () {
      return {
        max: 100,
        timeWindow: '1 minute',
        cache: 10000,
        allowList: whitelist,
        skipOnError: true, // Don't block on Redis errors
        keyGenerator: getKeyGenerator(),
        addHeaders: baseHeaders
      }
    },

    getStrictOptions () {
      return {
        max: 10,
        timeWindow: '1 minute',
        cache: 10000,
        allowList: whitelist,
        skipOnError: true,
        keyGenerator: getKeyGenerator(),
        addHeaders: baseHeaders
      }
    },

    getAuthOptions () {
      return {
        max: 10,
        timeWindow: '15 minutes',
        cache: 10000,
        allowList: whitelist,
        skipOnError: false, // Be strict on auth endpoints
        keyGenerator: getKeyGenerator(),
        addHeaders: baseHeaders,
        nameSpace: 'auth:'
      }
    },

    getClientIdentifier (request) {
      return getKeyGenerator()(request)
    },

    getEndpointConfigs () {
      return ENDPOINT_CONFIGS
    },

    getWhitelist () {
      return whitelist
    },

    isWhitelisted (ip) {
      return whitelist.includes(ip)
    },

    forEndpoint (category, endpoint = 'default') {
      const config = ENDPOINT_CONFIGS[category]?.[endpoint] ?? ENDPOINT_CONFIGS.api.default
      return {
        rateLimit: {
          ...config,
          keyGenerator: getKeyGenerator()
        }
      }
    },

    custom (max, timeWindow) {
      return {
        rateLimit: {
          max,
          timeWindow,
          keyGenerator: getKeyGenerator(),
          addHeaders: baseHeaders
        }
      }
    }
  }
}

// Export singleton for convenience
export const rateLimiter = createRateLimiter()
