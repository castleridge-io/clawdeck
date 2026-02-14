import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSettings,
  updateSettings,
  updatePassword,
  getApiToken,
  regenerateApiToken,
  getOpenClawSettings,
  updateOpenClawSettings,
  testOpenClawConnection,
  clearOpenClawApiKey,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import type { User } from '../lib/schemas'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: getSettings,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<User>) => updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings })
    },
  })
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      updatePassword(currentPassword, newPassword),
  })
}

export function useApiToken() {
  return useQuery({
    queryKey: queryKeys.apiToken,
    queryFn: getApiToken,
  })
}

export function useRegenerateApiToken() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: regenerateApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiToken })
    },
  })
}

export function useOpenClawSettings() {
  return useQuery({
    queryKey: queryKeys.openClawSettings,
    queryFn: getOpenClawSettings,
  })
}

export function useUpdateOpenClawSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { url?: string; apiKey?: string }) => updateOpenClawSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.openClawSettings })
    },
  })
}

export function useTestOpenClawConnection() {
  return useMutation({
    mutationFn: testOpenClawConnection,
  })
}

export function useClearOpenClawApiKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: clearOpenClawApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.openClawSettings })
    },
  })
}
