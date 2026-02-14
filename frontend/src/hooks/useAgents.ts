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
