import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  importWorkflowYaml,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { Workflow } from '../lib/schemas'

export function useWorkflows () {
  return useQuery({
    queryKey: queryKeys.workflows,
    queryFn: getWorkflows,
  })
}

export function useWorkflow (id: string) {
  return useQuery({
    queryKey: queryKeys.workflow(id),
    queryFn: () => getWorkflow(id),
    enabled: !!id,
  })
}

export function useCreateWorkflow () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<Workflow>) => createWorkflow(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows })
    },
  })
}

export function useUpdateWorkflow () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Workflow> }) => updateWorkflow(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflow(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows })
    },
  })
}

export function useDeleteWorkflow () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows })
    },
  })
}

export function useImportWorkflowYaml () {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (yamlString: string) => importWorkflowYaml(yamlString),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows })
    },
  })
}
