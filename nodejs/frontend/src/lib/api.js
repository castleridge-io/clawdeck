const API_BASE = process.env.VITE_API_URL || 'http://localhost:3333/api/v1'
const API_TOKEN = process.env.VITE_API_TOKEN || ''

// Store token for WebSocket use
if (typeof localStorage !== 'undefined' && API_TOKEN && !localStorage.getItem('clawdeck_api_token')) {
  localStorage.setItem('clawdeck_api_token', API_TOKEN)
}

export async function fetchWithAuth(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`

  // Get token from localStorage (set by login) or use env var
  const token = localStorage.getItem('clawdeck_api_token') || API_TOKEN

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

export async function getBoards() {
  const response = await fetchWithAuth('/boards')
  return response.data || response
}

export async function getBoard(boardId) {
  const response = await fetchWithAuth(`/boards/${boardId}`)
  return response.data || response
}

export async function getTasks(boardId) {
  const response = await fetchWithAuth(`/tasks?board_id=${boardId}`)
  return response.data || response
}

export async function createTask(taskData) {
  const response = await fetchWithAuth('/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  })
  return response.data || response
}

export async function updateTask(taskId, updates) {
  const response = await fetchWithAuth(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return response.data || response
}

export async function deleteTask(taskId) {
  await fetchWithAuth(`/tasks/${taskId}`, {
    method: 'DELETE',
  })
  return true
}

export async function assignTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}/assign`, {
    method: 'PATCH',
  })
  return response.data || response
}

export async function claimTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}/claim`, {
    method: 'PATCH',
  })
  return response.data || response
}

export async function unclaimTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}/unclaim`, {
    method: 'PATCH',
  })
  return response.data || response
}

export async function completeTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  })
  return response.data || response
}

export async function getNextTask() {
  const response = await fetchWithAuth('/tasks/next')
  return response || null
}
