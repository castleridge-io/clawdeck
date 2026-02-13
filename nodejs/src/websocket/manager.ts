import type { WebSocket } from '@fastify/websocket'

interface WebSocketConnection {
  socket: WebSocket
}

interface WSMessage {
  type: string
  message?: string
  event?: string
  data?: unknown
}

class WebSocketManager {
  private clients: Map<string, Set<WebSocketConnection>> = new Map()

  addClient (userId: bigint | string, connection: WebSocketConnection): void {
    const userIdStr = String(userId)
    if (!this.clients.has(userIdStr)) {
      this.clients.set(userIdStr, new Set())
    }
    this.clients.get(userIdStr)!.add(connection)

    // Send welcome message
    this.sendToClient(connection, {
      type: 'connected',
      message: 'WebSocket connection established',
    })

    // Handle disconnect
    connection.socket.on('close', () => {
      this.removeClient(userId, connection)
    })
  }

  removeClient (userId: bigint | string, connection: WebSocketConnection): void {
    const userIdStr = String(userId)
    const userClients = this.clients.get(userIdStr)
    if (userClients) {
      userClients.delete(connection)
      if (userClients.size === 0) {
        this.clients.delete(userIdStr)
      }
    }
  }

  sendToClient (connection: WebSocketConnection, data: WSMessage): void {
    try {
      connection.socket.send(JSON.stringify(data))
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
    }
  }

  broadcastToUser (userId: bigint | string, data: WSMessage): void {
    const userIdStr = String(userId)
    const userClients = this.clients.get(userIdStr)
    if (userClients) {
      for (const connection of userClients) {
        this.sendToClient(connection, data)
      }
    }
  }

  broadcastTaskEvent (userId: bigint | string, event: string, taskData: unknown): void {
    this.broadcastToUser(userId, {
      type: 'task_event',
      event,
      data: taskData,
    })
  }

  getConnectedClientsCount (userId: bigint | string): number {
    const userIdStr = String(userId)
    const userClients = this.clients.get(userIdStr)
    return userClients ? userClients.size : 0
  }

  getTotalConnectedClients (): number {
    let total = 0
    for (const clients of this.clients.values()) {
      total += clients.size
    }
    return total
  }
}

// Singleton instance
export const wsManager = new WebSocketManager()
