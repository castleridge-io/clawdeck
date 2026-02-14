export const queryKeys = {
  // Dashboard
  dashboard: ['dashboard'] as const,

  // Boards
  boards: ['boards'] as const,
  board: (id: string) => ['boards', id] as const,

  // Tasks
  tasks: (filters: { boardId?: string; boardIds?: string[] }) =>
    ['tasks', filters] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
  nextTask: () => ['tasks', 'next'] as const,

  // Agents
  agents: ['agents'] as const,

  // Workflows
  workflows: ['workflows'] as const,
  workflow: (id: string) => ['workflows', id] as const,

  // Runs
  runs: (filters: Record<string, unknown>) => ['runs', filters] as const,
  run: (id: string) => ['runs', id] as const,

  // Archive
  archivedTasks: (filters: Record<string, unknown>) => ['archive', filters] as const,

  // Settings
  settings: ['settings'] as const,
  apiToken: ['settings', 'apiToken'] as const,
  openClawSettings: ['settings', 'openclaw'] as const,

  // Admin
  users: ['admin', 'users'] as const,
  adminBoards: (filters: Record<string, unknown>) =>
    ['admin', 'boards', filters] as const,
  adminTasks: (filters: Record<string, unknown>) =>
    ['admin', 'tasks', filters] as const,
} as const
