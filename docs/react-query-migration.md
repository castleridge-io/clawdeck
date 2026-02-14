# React Query Migration Plan

## Overview

Migrate ClawDeck frontend from manual `useEffect` + `fetch` pattern to React Query (TanStack Query v5) for better caching, state management, and developer experience.

## Benefits

- **Automatic caching** - Shared data across components
- **Less boilerplate** - Removes ~100 lines of loading/error code
- **Optimistic updates** - Instant UI for drag-drop operations
- **Smart refetching** - Window focus, stale-time, retry logic
- **DevTools** - Visual cache inspection

## Phase 1: Setup & Infrastructure (Day 1)

### 1.1 Install Dependencies

```bash
yarn workspace clawdeck-frontend add @tanstack/react-query
```

### 1.2 Create Query Client Provider

Create `frontend/src/lib/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

### 1.3 Wrap App with Provider

Update `frontend/src/main.tsx`:

```typescript
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </QueryClientProvider>
)
```

### 1.4 Define Query Keys

Create `frontend/src/lib/queryKeys.ts`:

```typescript
export const queryKeys = {
  // Boards
  boards: ['boards'] as const,
  board: (id: string) => ['boards', id] as const,

  // Tasks
  tasks: (boardId: string) => ['tasks', boardId] as const,
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
  adminBoards: (filters: Record<string, unknown>) => ['admin', 'boards', filters] as const,
  adminTasks: (filters: Record<string, unknown>) => ['admin', 'tasks', filters] as const,
} as const
```

---

## Phase 2: Custom Hooks (Day 1-2)

Create `frontend/src/hooks/` directory with custom hooks.

### 2.1 useBoards.ts

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBoards, getBoard, createBoard, updateBoard, deleteBoard } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useBoards() {
  return useQuery({
    queryKey: queryKeys.boards,
    queryFn: getBoards,
  })
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: queryKeys.board(id),
    queryFn: () => getBoard(id),
    enabled: !!id,
  })
}

export function useCreateBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBoard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boards })
    },
  })
}

export function useUpdateBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBoard>[1] }) =>
      updateBoard(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.board(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.boards })
    },
  })
}

export function useDeleteBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteBoard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.boards })
    },
  })
}
```

### 2.2 useTasks.ts

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  claimTask,
  unclaimTask,
  completeTask,
  getNextTask,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { Task, TaskStatus } from '../lib/schemas'

export function useTasks(boardId: string) {
  return useQuery({
    queryKey: queryKeys.tasks(boardId),
    queryFn: () => getTasks(boardId),
    enabled: !!boardId,
  })
}

export function useNextTask() {
  return useQuery({
    queryKey: queryKeys.nextTask(),
    queryFn: getNextTask,
  })
}

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createTask,
    onSuccess: (_, variables) => {
      // Invalidate tasks for the board
      if (variables.board_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(variables.board_id) })
      }
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => updateTask(id, data),
    // Optimistic update
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks'] })

      // Snapshot previous value
      const previousTasks = queryClient.getQueriesData({ queryKey: ['tasks'] })

      // Optimistically update all task queries
      queryClient.setQueriesData({ queryKey: ['tasks'] }, (old: Task[] | undefined) => {
        if (!old) return old
        return old.map((task) => (task.id === id ? { ...task, ...data } : task))
      })

      return { previousTasks }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useClaimTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: claimTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useUnclaimTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: unclaimTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.archivedTasks({}) })
    },
  })
}
```

### 2.3 useAgents.ts

```typescript
import { useQuery } from '@tanstack/react-query'
import { getAgents } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: getAgents,
    staleTime: 1000 * 60 * 10, // 10 minutes - agents don't change often
  })
}
```

### 2.4 useWorkflows.ts, useRuns.ts, useArchive.ts, useSettings.ts

(Similar pattern - create one file per domain)

---

## Phase 3: Migrate Pages (Day 2-3)

### 3.1 BoardsPage.tsx (Before/After)

**Before:**
```typescript
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const [tasks, setTasks] = useState<Task[]>([])

useEffect(() => {
  loadData()
}, [boardId])

async function loadData() {
  setLoading(true)
  try {
    const data = await getTasks(boardId)
    setTasks(data)
  } catch (e) {
    setError(e.message)
  } finally {
    setLoading(false)
  }
}
```

**After:**
```typescript
const { data: tasks, isLoading, error } = useTasks(boardId)
```

### 3.2 Migration Order

| Page | Priority | Complexity |
|------|----------|------------|
| BoardsPage | High | Medium (drag-drop, WebSocket) |
| TasksPage | High | Low |
| DashboardPage | High | Medium (aggregates) |
| WorkflowsPage | Medium | Low |
| RunsPage | Medium | Low |
| ArchivePage | Medium | Medium (pagination) |
| SettingsPage | Low | Medium (multiple queries) |
| AdminPages | Low | Low |

---

## Phase 4: WebSocket Integration (Day 3-4)

### 4.1 Update WebSocket Manager

Modify `frontend/src/lib/websocket.ts` to use queryClient:

```typescript
import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'

// In WebSocket message handler:
wsClient.on('task_event', (event) => {
  const { type, task } = event

  if (type === 'created' || type === 'updated') {
    // Update specific task in cache
    queryClient.setQueryData(
      queryKeys.tasks(task.board_id),
      (old: Task[] | undefined) => {
        if (!old) return [task]
        const index = old.findIndex((t) => t.id === task.id)
        if (index === -1) return [...old, task]
        return [...old.slice(0, index), task, ...old.slice(index + 1)]
      }
    )
  }

  if (type === 'deleted') {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }
})
```

---

## Phase 5: Tests (Day 4)

### 5.1 Test Utilities

Create `frontend/src/test/utils.tsx`:

```typescript
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactElement } from 'react'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

export function renderWithQueryClient(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = createTestQueryClient()

  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    ...options,
  })
}
```

### 5.2 Update Existing Tests

Replace API mocks with MSW or use `queryClient.setQueryData` for pre-populated cache.

---

## Migration Checklist

### Setup
- [ ] Install @tanstack/react-query
- [ ] Create queryClient.ts
- [ ] Create queryKeys.ts
- [ ] Wrap app with QueryClientProvider

### Hooks
- [ ] Create useBoards.ts
- [ ] Create useTasks.ts
- [ ] Create useAgents.ts
- [ ] Create useWorkflows.ts
- [ ] Create useRuns.ts
- [ ] Create useArchive.ts
- [ ] Create useSettings.ts
- [ ] Create useAdmin.ts

### Pages
- [ ] Migrate BoardsPage.tsx
- [ ] Migrate TasksPage.tsx
- [ ] Migrate DashboardPage.tsx
- [ ] Migrate WorkflowsPage.tsx
- [ ] Migrate RunsPage.tsx
- [ ] Migrate ArchivePage.tsx
- [ ] Migrate SettingsPage.tsx
- [ ] Migrate AdminDataPage.tsx
- [ ] Migrate AdminPage.tsx

### Batch Optimization (Phase 6)
- [ ] Add `board_ids` filter to tasks endpoint
- [ ] Create dashboard aggregation endpoint
- [ ] Update frontend hooks to use batch endpoints
- [ ] Remove Promise.all N+1 patterns

### Advanced
- [ ] Implement optimistic updates for drag-drop
- [ ] Add WebSocket cache integration
- [ ] Update tests

---

## Phase 6: Batch Query Optimization (Recommended)

### Problem: N+1 Query Pattern

Current frontend makes N+1 API calls:
1. Fetch all boards (1 request)
2. For each board, fetch its tasks (N requests)

```
GET /api/v1/boards                    → 1 request
GET /api/v1/tasks?board_id=1          → N requests
GET /api/v1/tasks?board_id=2
GET /api/v1/tasks?board_id=3
...
```

### 6.1 Multi-Board Tasks Endpoint

Add support for multiple board IDs in tasks query:

**Backend** (`nodejs/src/routes/tasks.js`):
```javascript
// GET /api/v1/tasks - Enhanced with board_ids filter
fastify.get('/', async (request, reply) => {
  const { assigned, status, board_id, board_ids, archived } = request.query

  const where = { userId: BigInt(request.user.id) }

  // Support comma-separated board_ids
  if (board_ids) {
    const ids = board_ids.split(',').map(id => BigInt(id.trim()))
    where.boardId = { in: ids }
  } else if (board_id) {
    where.boardId = BigInt(board_id)
  }

  // ... rest of query logic
})
```

**Frontend Usage**:
```typescript
// Before: N+1 queries
const boards = await getBoards()
const taskPromises = boards.map(b => getTasks(b.id))
const tasks = await Promise.all(taskPromises)

// After: Single query
const boards = await getBoards()
const tasks = await getTasks({ board_ids: boards.map(b => id).join(',') })
```

### 6.2 Dashboard Aggregation Endpoint

Create a combined endpoint for dashboard data:

**Backend** (`nodejs/src/routes/dashboard.js`):
```javascript
// GET /api/v1/dashboard - Aggregated dashboard data
fastify.get('/', async (request, reply) => {
  const userId = BigInt(request.user.id)

  const [boards, agents, tasks] = await Promise.all([
    prisma.board.findMany({ where: { userId } }),
    prisma.agent.findMany({ where: { userId } }),
    prisma.task.findMany({
      where: { userId, archived: false },
      select: { status: true, priority: true, boardId: true }
    }),
  ])

  // Aggregate counts
  const taskCounts = {
    total: tasks.length,
    inbox: tasks.filter(t => t.status === 'inbox').length,
    up_next: tasks.filter(t => t.status === 'up_next').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    in_review: tasks.filter(t => t.status === 'in_review').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  return {
    boards: boards.map(boardToJson),
    agents: agents.map(agentToJson),
    taskCounts,
    // Include minimal task data for list views
    recentTasks: tasks.slice(0, 20).map(t => ({ id: t.id.toString(), status: t.status })),
  }
})
```

**Frontend Hook**:
```typescript
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    staleTime: 1000 * 30, // 30 seconds - dashboard can be slightly stale
  })
}
```

### 6.3 Performance Impact

| Page | Before | After | Improvement |
|------|--------|-------|-------------|
| Dashboard | 1 + N requests | 1 request | ~80% fewer |
| Boards | 2 + N requests | 2 requests | ~75% fewer |
| Tasks | 1 + N requests | 2 requests | ~70% fewer |

For 10 boards:
- Before: 11-12 requests per page load
- After: 1-2 requests per page load

---

## Rollback Plan

If issues arise:
1. Keep old API functions intact
2. Hooks are additive - can revert page imports
3. Remove QueryClientProvider to disable

## Success Metrics

- [ ] All pages using React Query hooks
- [ ] No manual loading/error state in components
- [ ] Drag-drop uses optimistic updates
- [ ] WebSocket updates cache directly
- [ ] Tests pass with new setup
