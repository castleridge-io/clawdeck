import { useQuery } from '@tanstack/react-query'
import { getBoards, getBoard, getOrganizations } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

interface BoardsFilter {
  organization_id?: string
}

export function useBoards (filter?: BoardsFilter) {
  return useQuery({
    queryKey: queryKeys.boards(filter),
    queryFn: () => getBoards(filter),
  })
}

export function useBoard (id: string) {
  return useQuery({
    queryKey: queryKeys.board(id),
    queryFn: () => getBoard(id),
    enabled: !!id,
  })
}

export function useOrganizations () {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: getOrganizations,
  })
}
