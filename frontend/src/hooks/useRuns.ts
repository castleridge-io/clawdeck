import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getRuns, getRun, triggerRun, cancelRun } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

interface RunFilters {
  status?: string
  workflow_id?: string
  page?: number
  limit?: number
}

export function useRuns(filters: RunFilters = {}) {
  return useQuery({
    queryKey: queryKeys.runs(filters as Record<string, unknown>),
    queryFn: () => getRuns(filters),
  })
}

export function useRun(id: string) {
  return useQuery({
    queryKey: queryKeys.run(id),
    queryFn: () => getRun(id),
    enabled: !!id,
  })
}

export function useTriggerRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (workflowId: string) => triggerRun(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

export function useCancelRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (runId: string) => cancelRun(runId),
    onSuccess: (_, runId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.run(runId) })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}
