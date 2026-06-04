import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export interface MyPrediction {
  id: string
  matchId: string
  roundId: string
  homeGoals: number
  awayGoals: number
  isJoker: boolean
  baseTier: string | null
  totalPoints: number | null
}

export function useMyPredictions() {
  return useQuery({
    queryKey: ['predictions'],
    queryFn: () => $fetch<{ predictions: MyPrediction[] }>('/api/predictions').then((r) => r.predictions),
  })
}

export function usePredictionMutations() {
  const queryClient = useQueryClient()

  const upsert = useMutation({
    mutationFn: (input: { matchId: string; home: number; away: number }) =>
      $fetch('/api/predictions', { method: 'PUT', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictions'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
    },
  })

  const setJoker = useMutation({
    mutationFn: (input: { matchId: string; isJoker: boolean }) =>
      $fetch('/api/predictions/joker', { method: 'PUT', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['predictions'] }),
  })

  return { upsert, setJoker }
}
