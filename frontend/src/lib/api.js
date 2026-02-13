// Use relative path for Docker (nginx proxy handles routing to backend)
const API_BASE = '/api/v1';
const API_TOKEN = 'oc-sys-6e07444c51f93cb9ab69282a06878195-b3032039';

// Store token for WebSocket use
if (typeof localStorage !== 'undefined' && !localStorage.getItem('clawdeck_api_token')) {
  localStorage.setItem('clawdeck_api_token', API_TOKEN);
}

export async function fetchWithAuth(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function getBoards() {
  const response = await fetchWithAuth('/boards');
  return response.data || response;
}

export async function getAgents() {
  const response = await fetchWithAuth('/agents');
  return response.data || response;
}

export async function getBoard(boardId) {
  const response = await fetchWithAuth(`/boards/${boardId}`);
  return response.data || response;
}

export async function getTasks(boardId) {
  const response = await fetchWithAuth(`/tasks?board_id=${boardId}`);
  return response.data || response;
}

export async function createTask(taskData) {
  const response = await fetchWithAuth('/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });
  return response.data || response;
}

export async function updateTask(taskId, updates) {
  const response = await fetchWithAuth(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return response.data || response;
}

export async function deleteTask(taskId) {
  await fetchWithAuth(`/tasks/${taskId}`, {
    method: 'DELETE',
  });
  return true;
}

export async function assignTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}/assign`, {
    method: 'PATCH',
  });
  return response.data || response;
}

export async function claimTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}/claim`, {
    method: 'PATCH',
  });
  return response.data || response;
}

export async function unclaimTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}/unclaim`, {
    method: 'PATCH',
  });
  return response.data || response;
}

export async function completeTask(taskId) {
  const response = await fetchWithAuth(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  });
  return response.data || response;
}

export async function getNextTask() {
  const response = await fetchWithAuth('/tasks/next');
  return response || null;
}

// Archive-related functions
export async function getArchivedTasks(filters = {}) {
  const params = new URLSearchParams();
  if (filters.board_id) params.append('board_id', filters.board_id);
  if (filters.page) params.append('page', filters.page);
  if (filters.limit) params.append('limit', filters.limit);

  const queryString = params.toString();
  const response = await fetchWithAuth(`/archives${queryString ? `?${queryString}` : ''}`);
  return response.data || response;
}

export async function unarchiveTask(taskId) {
  const response = await fetchWithAuth(`/archives/${taskId}/unarchive`, {
    method: 'PATCH',
  });
  return response.data || response;
}

export async function scheduleArchive(taskId) {
  const response = await fetchWithAuth(`/archives/${taskId}/schedule`, {
    method: 'PATCH',
  });
  return response.data || response;
}

export async function deleteArchivedTask(taskId) {
  await fetchWithAuth(`/archives/${taskId}`, {
    method: 'DELETE',
  });
  return true;
}
