import { prisma } from '../db/prisma.js'
import type { Prisma } from '@prisma/client'

const OPENCLAW_SETTINGS_KEY = 'openclaw'

interface OpenClawSettingsValue {
  url?: string
  apiKey?: string | null
  connected?: boolean
  lastChecked?: string | null
}

interface OpenClawSettingsResponse {
  url: string
  apiKey: string
  hasApiKey?: boolean
  connected: boolean
  lastChecked?: string | null
}

interface UpdateOpenClawData {
  url?: string
  apiKey?: string
}

interface ConnectionTestResult {
  success: boolean
  message?: string
  error?: string
}

/**
 * Create settings service
 */
export function createSettingsService () {
  return {
    /**
     * Get OpenClaw settings
     */
    async getOpenClawSettings (): Promise<OpenClawSettingsResponse> {
      const setting = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY },
      })

      if (!setting) {
        return {
          url: '',
          apiKey: '',
          connected: false,
        }
      }

      const value = setting.value as OpenClawSettingsValue
      return {
        url: value.url || '',
        apiKey: value.apiKey
          ? '••••••••' + (value.apiKey.length > 8 ? value.apiKey.slice(-4) : '')
          : '',
        hasApiKey: !!value.apiKey,
        connected: value.connected || false,
        lastChecked: value.lastChecked || null,
      }
    },

    /**
     * Update OpenClaw settings
     */
    async updateOpenClawSettings (data: UpdateOpenClawData): Promise<OpenClawSettingsResponse> {
      const existing = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY },
      })

      const currentValue = (existing?.value as OpenClawSettingsValue) || {}

      // Only update apiKey if provided and not masked
      const newApiKey =
        data.apiKey && !data.apiKey.startsWith('••••') ? data.apiKey : currentValue.apiKey

      const newValue: OpenClawSettingsValue = {
        url: data.url !== undefined ? data.url : currentValue.url,
        apiKey: newApiKey,
        connected: currentValue.connected || false,
        lastChecked: currentValue.lastChecked || null,
      }

      await prisma.systemSettings.upsert({
        where: { key: OPENCLAW_SETTINGS_KEY },
        update: { value: newValue as Prisma.InputJsonValue },
        create: { key: OPENCLAW_SETTINGS_KEY, value: newValue as Prisma.InputJsonValue },
      })

      return {
        url: newValue.url || '',
        apiKey: newValue.apiKey ? '••••••••' + newValue.apiKey.slice(-4) : '',
        hasApiKey: !!newValue.apiKey,
        connected: newValue.connected || false,
        lastChecked: newValue.lastChecked || null,
      }
    },

    /**
     * Test OpenClaw connection
     */
    async testOpenClawConnection (): Promise<ConnectionTestResult> {
      const setting = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY },
      })

      if (!setting) {
        return { success: false, error: 'OpenClaw settings not configured' }
      }

      const { url, apiKey } = setting.value as OpenClawSettingsValue

      if (!url) {
        return { success: false, error: 'OpenClaw URL not configured' }
      }

      try {
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(10000), // 10 second timeout
        })

        const connected = response.ok

        // Update connection status
        await prisma.systemSettings.update({
          where: { key: OPENCLAW_SETTINGS_KEY },
          data: {
            value: {
              ...(setting.value as Record<string, unknown>),
              connected,
              lastChecked: new Date().toISOString(),
            },
          },
        })

        if (connected) {
          return { success: true, message: 'Successfully connected to OpenClaw' }
        } else {
          return { success: false, error: `OpenClaw returned status ${response.status}` }
        }
      } catch (error) {
        // Update connection status to failed
        await prisma.systemSettings.update({
          where: { key: OPENCLAW_SETTINGS_KEY },
          data: {
            value: {
              ...(setting.value as Record<string, unknown>),
              connected: false,
              lastChecked: new Date().toISOString(),
            },
          },
        })

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        }
      }
    },

    /**
     * Clear OpenClaw API key (for security)
     */
    async clearOpenClawApiKey (): Promise<void> {
      const existing = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY },
      })

      if (existing) {
        await prisma.systemSettings.update({
          where: { key: OPENCLAW_SETTINGS_KEY },
          data: {
            value: {
              ...(existing.value as Record<string, unknown>),
              apiKey: null,
              connected: false,
            },
          },
        })
      }
    },
  }
}
