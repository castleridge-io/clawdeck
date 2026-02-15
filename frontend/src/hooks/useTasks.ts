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
import type { Task } from '../lib/schemas'

interface TasksFilter {
  boardId?: string
  boardIds?: string[]
}

export function useTasks (filter?: TasksFilter) {
  return useQuery({
    queryKey: queryKeys.tasks({ boardId: filter?.boardId, boardIds: filter?.boardIds }),
    queryFn: () => getTasks(filter),
    enabled: !filter || !!filter.boardId || (filter.boardIds !== undefined && filter.boardIds.length > 0),
  })
}

export function useNextTask () {
  return useQuery({
    queryKey: queryKeys.nextTask(),
    queryFn: getNextTask,
  })
}

export function useCreateTask () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskData: Partial<Task>) => createTask(taskData),
    onSuccess: () => {
      // Invalidate both single board and boardIds array queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'tasks'
        },
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

export function useUpdateTask () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'tasks'
        },
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

export function useDeleteTask () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'tasks'
        },
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

export function useClaimTask () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => claimTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'tasks'
        },
      })
    },
  })
}

export function useUnclaimTask () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => unclaimTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'tasks'
        },
      })
    },
  })
}

export function useCompleteTask () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'], type: 'all' })
      queryClient.invalidateQueries({ queryKey: queryKeys.archivedTasks({}) })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}
