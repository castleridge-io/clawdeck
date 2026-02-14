import { useQuery } from '@tanstack/react-query'
import { getBoards, getBoard } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useBoards() {
  return useQuery({
    queryKey: queryKeys.boards,
    queryFn: getBoards,
  })
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: queryKeys.board(id),
    queryFn: () => getBoard(id),
    enabled: !!id,
  })
}
