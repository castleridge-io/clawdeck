// WebSocket client for real-time task updates

const WS_URL = `ws://${window.location.hostname}:3001/ws`

class WebSocketClient {
  constructor() {
    this.ws = null
    this.listeners = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.reconnectTimer = null
    this.isIntentionalClose = false
  }

  connect(token) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const url = `${WS_URL}?token=${token}`
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
        this.emit('connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.emit(data.type, data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.emit('disconnected')

        if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect(token)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.emit('error', error)
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
    }
  }

  scheduleReconnect(token) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts)
    console.log(`Reconnecting in ${delay}ms...`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++
      this.connect(token)
    }, delay)
  }

  disconnect() {
    this.isIntentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event).add(callback)
  }

  off(event, callback) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      eventListeners.delete(callback)
      if (eventListeners.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  emit(event, data) {
    const eventListeners = this.listeners.get(event)
    if (eventListeners) {
      for (const callback of eventListeners) {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in WebSocket listener for ${event}:`, error)
        }
      }
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }
}

// Singleton instance
export const wsClient = new WebSocketClient()
