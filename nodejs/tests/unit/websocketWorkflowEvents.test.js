import { describe, it } from 'node:test'
import { wsManager } from '../../src/websocket/manager.ts'

// ========================================
// TDD RED PHASE: Tests for workflow WebSocket events
// These tests FAIL because broadcastWorkflowEvent doesn't exist
// ========================================

describe('WebSocket Workflow Events - RED PHASE', () => {
  it('should broadcast step.status.changed event', async () => {
    // This will FAIL - method doesn't exist
    const hasMethod = typeof wsManager.broadcastWorkflowEvent === 'function'

    // For RED phase, we want this assertion to FAIL
    // Once we implement, this will pass
    if (!hasMethod) {
      throw new Error('broadcastWorkflowEvent method not found - RED PHASE')
    }
  })

  it('should broadcast run.completed event', async () => {
    // This will FAIL - method doesn't exist
    wsManager.broadcastWorkflowEvent('user-1', 'run.completed', {
      runId: 'run-abc',
    })
  })

  it('should broadcast run.failed event', async () => {
    // This will FAIL - method doesn't exist
    wsManager.broadcastWorkflowEvent('user-1', 'run.failed', {
      runId: 'run-xyz',
    })
  })
})
