import { useQuery } from '@tanstack/react-query'
import { getDashboard } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useDashboard () {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: getDashboard,
    staleTime: 1000 * 30, // 30 seconds - dashboard can be slightly stale
  })
}
