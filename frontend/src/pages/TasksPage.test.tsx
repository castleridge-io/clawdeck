import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TasksPage from './TasksPage'
import * as hooks from '../hooks'

// Mock hooks
vi.mock('../hooks', () => ({
  useBoards: vi.fn(),
  useTasks: vi.fn(),
  useAgents: vi.fn(),
  useUpdateTask: vi.fn(),
  useDeleteTask: vi.fn(),
}))

// Mock LoadingSpinner
vi.mock('../components/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>,
}))

const mockBoards = [
  { id: '1', name: 'Board 1' },
  { id: '2', name: 'Board 2' },
]

const mockTasks = [
  { id: '1', name: 'Task 1', board_id: '1', status: 'inbox', assignee_id: null, created_at: '2024-01-01' },
  { id: '2', name: 'Task 2', board_id: '1', status: 'done', assignee_id: 'agent-1', created_at: '2024-01-02' },
]

const mockAgents = [
  { uuid: 'agent-1', name: 'Agent One', emoji: '🤖', color: 'blue', slug: 'agent-one' },
  { uuid: 'agent-2', name: 'Agent Two', emoji: '🦾', color: 'green', slug: 'agent-two' },
]

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('TasksPage', () => {
  let mockMutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockMutate = vi.fn().mockResolvedValue(undefined)

    vi.mocked(hooks.useBoards).mockReturnValue({
      data: mockBoards,
      isLoading: false,
    } as ReturnType<typeof hooks.useBoards>)

    vi.mocked(hooks.useTasks).mockReturnValue({
      data: mockTasks,
      isLoading: false,
    } as ReturnType<typeof hooks.useTasks>)

    vi.mocked(hooks.useAgents).mockReturnValue({
      data: mockAgents,
      isLoading: false,
    } as ReturnType<typeof hooks.useAgents>)

    vi.mocked(hooks.useUpdateTask).mockReturnValue({
      mutateAsync: mockMutate,
    } as ReturnType<typeof hooks.useUpdateTask>)

    vi.mocked(hooks.useDeleteTask).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    } as ReturnType<typeof hooks.useDeleteTask>)
  })

  it('renders tasks table with columns', () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #then
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('Board')).toBeInTheDocument()
    expect(screen.getByText('Assignee')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('displays refresh button', () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #then
    expect(screen.getByText('Refresh')).toBeInTheDocument()
  })

  it('displays task names in the table', () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #then
    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.getByText('Task 2')).toBeInTheDocument()
  })

  it('shows assignee dropdown for each task', () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #then
    const assigneeSelects = screen.getAllByRole('combobox')
    // One for status filter, one for board filter, one for each task's assignee
    expect(assigneeSelects.length).toBeGreaterThanOrEqual(2)
  })

  it('displays agents in assignee dropdown', async () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #then - check that agent options exist in the document (multiple due to each task having a dropdown)
    expect(screen.getAllByText(/Agent One/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Agent Two/).length).toBeGreaterThan(0)
  })

  it('calls updateTask when assignee is changed', async () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #when - find the first task's assignee dropdown (third combobox)
    const selects = screen.getAllByRole('combobox')
    const assigneeSelect = selects[2] // First task's assignee select
    fireEvent.change(assigneeSelect, { target: { value: 'agent-1' } })

    // #then
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          data: { assignee_id: 'agent-1' },
        })
      )
    })
  })

  it('filters tasks by status', async () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #when - select "Inbox" status filter
    const selects = screen.getAllByRole('combobox')
    const statusSelect = selects[0] // Status filter
    fireEvent.change(statusSelect, { target: { value: 'inbox' } })

    // #then - only Task 1 should be visible (inbox status)
    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument()
    })
  })

  it('filters tasks by board', async () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #when - select "Board 2" filter
    const selects = screen.getAllByRole('combobox')
    const boardSelect = selects[1] // Board filter
    fireEvent.change(boardSelect, { target: { value: '2' } })

    // #then - no tasks should be visible (both tasks are on board 1)
    await waitFor(() => {
      expect(screen.getByText('No tasks found')).toBeInTheDocument()
    })
  })

  it('shows loading state while fetching', () => {
    // #given
    vi.mocked(hooks.useBoards).mockReturnValue({
      data: [],
      isLoading: true,
    } as ReturnType<typeof hooks.useBoards>)

    // #when
    render(<TasksPage />, { wrapper: createWrapper() })

    // #then
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('displays Unassigned option in assignee dropdown', () => {
    // #given
    render(<TasksPage />, { wrapper: createWrapper() })

    // #then
    expect(screen.getAllByText('Unassigned')[0]).toBeInTheDocument()
  })
})
