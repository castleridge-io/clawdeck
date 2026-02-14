import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getArchivedTasks, unarchiveTask, scheduleArchive, deleteArchivedTask } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

interface ArchiveFilters {
  board_id?: string
  page?: number
  limit?: number
}

export function useArchivedTasks(filters: ArchiveFilters = {}) {
  return useQuery({
    queryKey: queryKeys.archivedTasks(filters as Record<string, unknown>),
    queryFn: () => getArchivedTasks(filters),
  })
}

export function useUnarchiveTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => unarchiveTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useScheduleArchive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => scheduleArchive(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDeleteArchivedTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: string) => deleteArchivedTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['archive'] })
    },
  })
}
