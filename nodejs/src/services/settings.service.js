import { prisma } from '../db/prisma.js'

const OPENCLAW_SETTINGS_KEY = 'openclaw'

/**
 * Create settings service
 */
export function createSettingsService() {
  return {
    /**
     * Get OpenClaw settings
     * @returns {Promise<object>} OpenClaw settings
     */
    async getOpenClawSettings() {
      const setting = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY }
      })

      if (!setting) {
        return {
          url: '',
          apiKey: '',
          connected: false
        }
      }

      const value = setting.value
      return {
        url: value.url || '',
        apiKey: value.apiKey ? '••••••••' + (value.apiKey.length > 8 ? value.apiKey.slice(-4) : '') : '',
        hasApiKey: !!value.apiKey,
        connected: value.connected || false,
        lastChecked: value.lastChecked || null
      }
    },

    /**
     * Update OpenClaw settings
     * @param {object} data - Settings data
     * @param {string} [data.url] - OpenClaw URL
     * @param {string} [data.apiKey] - OpenClaw API key (optional, won't update if not provided)
     * @returns {Promise<object>} Updated settings
     */
    async updateOpenClawSettings(data) {
      const existing = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY }
      })

      const currentValue = existing?.value || {}

      // Only update apiKey if provided and not masked
      const newApiKey = data.apiKey && !data.apiKey.startsWith('••••') ? data.apiKey : currentValue.apiKey

      const newValue = {
        url: data.url !== undefined ? data.url : currentValue.url,
        apiKey: newApiKey,
        connected: currentValue.connected || false,
        lastChecked: currentValue.lastChecked || null
      }

      await prisma.systemSettings.upsert({
        where: { key: OPENCLAW_SETTINGS_KEY },
        update: { value: newValue },
        create: { key: OPENCLAW_SETTINGS_KEY, value: newValue }
      })

      return {
        url: newValue.url,
        apiKey: newValue.apiKey ? '••••••••' + newValue.apiKey.slice(-4) : '',
        hasApiKey: !!newValue.apiKey,
        connected: newValue.connected,
        lastChecked: newValue.lastChecked
      }
    },

    /**
     * Test OpenClaw connection
     * @returns {Promise<object>} Connection test result
     */
    async testOpenClawConnection() {
      const setting = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY }
      })

      if (!setting) {
        return { success: false, error: 'OpenClaw settings not configured' }
      }

      const { url, apiKey } = setting.value

      if (!url) {
        return { success: false, error: 'OpenClaw URL not configured' }
      }

      try {
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(10000) // 10 second timeout
        })

        const connected = response.ok

        // Update connection status
        await prisma.systemSettings.update({
          where: { key: OPENCLAW_SETTINGS_KEY },
          data: {
            value: {
              ...setting.value,
              connected,
              lastChecked: new Date().toISOString()
            }
          }
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
              ...setting.value,
              connected: false,
              lastChecked: new Date().toISOString()
            }
          }
        })

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Connection failed'
        }
      }
    },

    /**
     * Clear OpenClaw API key (for security)
     * @returns {Promise<void>}
     */
    async clearOpenClawApiKey() {
      const existing = await prisma.systemSettings.findUnique({
        where: { key: OPENCLAW_SETTINGS_KEY }
      })

      if (existing) {
        await prisma.systemSettings.update({
          where: { key: OPENCLAW_SETTINGS_KEY },
          data: {
            value: {
              ...existing.value,
              apiKey: null,
              connected: false
            }
          }
        })
      }
    }
  }
}
