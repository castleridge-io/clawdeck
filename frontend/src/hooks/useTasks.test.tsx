import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useTasks,
  useUpdateTask,
  useDeleteTask,
  useCreateTask,
} from './useTasks'
import * as api from '../lib/api'
import type { Task } from '../lib/schemas'

// Mock API functions
vi.mock('../lib/api', () => ({
  getTasks: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  createTask: vi.fn(),
  claimTask: vi.fn(),
  unclaimTask: vi.fn(),
  completeTask: vi.fn(),
  getNextTask: vi.fn(),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useTasks hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useTasks', () => {
    it('fetches tasks with boardIds filter', async () => {
      // #given
      const mockTasks: Task[] = [
        { id: '1', name: 'Task 1', status: 'inbox' as const, board_id: '1' },
      ]
      vi.mocked(api.getTasks).mockResolvedValue(mockTasks)

      // #when
      const { result } = renderHook(() => useTasks({ boardIds: ['1'] }), {
        wrapper: createWrapper(),
      })

      // #then
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockTasks)
      expect(api.getTasks).toHaveBeenCalledWith({ boardIds: ['1'] })
    })

    it('does not fetch when boardIds is empty', () => {
      // #given
      vi.mocked(api.getTasks).mockResolvedValue([])

      // #when
      renderHook(() => useTasks({ boardIds: [] }), {
        wrapper: createWrapper() as never,
      })

      // #then
      expect(api.getTasks).not.toHaveBeenCalled()
    })
  })

  describe('useUpdateTask', () => {
    it('calls updateTask API and invalidates queries', async () => {
      // #given
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      // #when
      const { result } = renderHook(() => useUpdateTask(), { wrapper: wrapper as never })

      result.current.mutateAsync({ id: '1', data: { status: 'done' } })

      // #then
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.updateTask).toHaveBeenCalledWith('1', { status: 'done' })
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useDeleteTask', () => {
    it('calls deleteTask API', async () => {
      // #given
      vi.mocked(api.deleteTask).mockResolvedValue(true)

      // #when
      const { result } = renderHook(() => useDeleteTask(), {
        wrapper: createWrapper() as never,
      })

      result.current.mutateAsync('1')

      // #then
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.deleteTask).toHaveBeenCalledWith('1')
    })
  })

  describe('useCreateTask', () => {
    it('calls createTask API', async () => {
      // #given
      const newTask = { id: '1', name: 'New Task', status: 'inbox' as const, board_id: 'board-1' }
      vi.mocked(api.createTask).mockResolvedValue(newTask as unknown as typeof newTask)

      // #when
      const { result } = renderHook(() => useCreateTask(), {
        wrapper: createWrapper() as never,
      })

      result.current.mutateAsync({ name: 'New Task', board_id: '1', status: 'inbox' })

      // #then
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.createTask).toHaveBeenCalledWith({
        name: 'New Task',
        board_id: '1',
        status: 'inbox',
      })
    })
  })
})
