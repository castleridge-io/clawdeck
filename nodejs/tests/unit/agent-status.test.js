import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Compute agent status based on lastActiveAt
 * - active: last active within 5 minutes
 * - idle: last active within 30 minutes
 * - offline: last active more than 30 minutes ago or never
 */
function computeAgentStatus (lastActiveAt) {
  if (!lastActiveAt) return 'offline'

  const now = new Date()
  const lastActive = new Date(lastActiveAt)
  const diffMs = now.getTime() - lastActive.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 5) return 'active'
  if (diffMins < 30) return 'idle'
  return 'offline'
}

describe('Agent Status', () => {
  describe('computeAgentStatus', () => {
    it('returns offline when lastActiveAt is null', () => {
      const status = computeAgentStatus(null)
      assert.strictEqual(status, 'offline')
    })

    it('returns offline when lastActiveAt is undefined', () => {
      const status = computeAgentStatus(undefined)
      assert.strictEqual(status, 'offline')
    })

    it('returns active when last active less than 5 minutes ago', () => {
      const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000)
      const status = computeAgentStatus(twoMinsAgo)
      assert.strictEqual(status, 'active')
    })

    it('returns active when last active exactly 4 minutes ago', () => {
      const fourMinsAgo = new Date(Date.now() - 4 * 60 * 1000)
      const status = computeAgentStatus(fourMinsAgo)
      assert.strictEqual(status, 'active')
    })

    it('returns idle when last active between 5 and 30 minutes ago', () => {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000)
      const status = computeAgentStatus(tenMinsAgo)
      assert.strictEqual(status, 'idle')
    })

    it('returns idle when last active exactly 29 minutes ago', () => {
      const twentyNineMinsAgo = new Date(Date.now() - 29 * 60 * 1000)
      const status = computeAgentStatus(twentyNineMinsAgo)
      assert.strictEqual(status, 'idle')
    })

    it('returns offline when last active more than 30 minutes ago', () => {
      const fortyMinsAgo = new Date(Date.now() - 40 * 60 * 1000)
      const status = computeAgentStatus(fortyMinsAgo)
      assert.strictEqual(status, 'offline')
    })

    it('returns offline when last active exactly 30 minutes ago', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000)
      const status = computeAgentStatus(thirtyMinsAgo)
      assert.strictEqual(status, 'offline')
    })

    it('returns offline when last active 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const status = computeAgentStatus(oneHourAgo)
      assert.strictEqual(status, 'offline')
    })

    it('returns active for just now', () => {
      const justNow = new Date()
      const status = computeAgentStatus(justNow)
      assert.strictEqual(status, 'active')
    })
  })
})
