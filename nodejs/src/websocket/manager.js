// WebSocket connection manager for real-time task updates

class WebSocketManager {
  constructor() {
    this.clients = new Map() // userId -> Set of WebSocket connections
  }

  addClient(userId, connection) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set())
    }
    this.clients.get(userId).add(connection)

    // Send welcome message
    this.sendToClient(connection, {
      type: 'connected',
      message: 'WebSocket connection established'
    })

    // Handle disconnect
    connection.socket.on('close', () => {
      this.removeClient(userId, connection)
    })
  }

  removeClient(userId, connection) {
    const userClients = this.clients.get(userId)
    if (userClients) {
      userClients.delete(connection)
      if (userClients.size === 0) {
        this.clients.delete(userId)
      }
    }
  }

  sendToClient(connection, data) {
    try {
      connection.socket.send(JSON.stringify(data))
    } catch (error) {
      console.error('Failed to send WebSocket message:', error)
    }
  }

  broadcastToUser(userId, data) {
    const userClients = this.clients.get(String(userId))
    if (userClients) {
      for (const connection of userClients) {
        this.sendToClient(connection, data)
      }
    }
  }

  broadcastTaskEvent(userId, event, taskData) {
    this.broadcastToUser(userId, {
      type: 'task_event',
      event,
      data: taskData
    })
  }

  getConnectedClientsCount(userId) {
    const userClients = this.clients.get(String(userId))
    return userClients ? userClients.size : 0
  }

  getTotalConnectedClients() {
    let total = 0
    for (const clients of this.clients.values()) {
      total += clients.size
    }
    return total
  }
}

// Singleton instance
export const wsManager = new WebSocketManager()
