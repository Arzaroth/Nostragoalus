import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Serialized } from '../../shared/types/serialized'
import type { getMyPredictions } from '../../server/utils/predictions/service'

// Derived from the server query so it can never drift from the schema. The
// public-predictions endpoint adds the competition fields, hence optional here.
export type MyPrediction = Serialized<Awaited<ReturnType<typeof getMyPredictions>>[number]> & {
  competitionSlug?: string
  competitionName?: string
}

export function useMyPredictions() {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['predictions', slug],
    queryFn: () =>
      $fetch<{ predictions: MyPrediction[] }>('/api/predictions', {
        query: slug.value ? { competition: slug.value } : {},
      }).then((r) => r.predictions),
  })
}

export function useUserPredictions(userId: MaybeRefOrGetter<string>) {
  const id = toRef(userId)
  return useQuery({
    queryKey: ['user-predictions', id],
    queryFn: () =>
      $fetch<{ user: { id: string; name: string }; predictions: MyPrediction[] }>(`/api/users/${id.value}/predictions`),
  })
}

export function usePredictionMutations() {
  const queryClient = useQueryClient()

  const upsert = useMutation({
    mutationFn: (input: { matchId: string; home: number; away: number }) =>
      $fetch<{ id: string }>('/api/predictions', { method: 'PUT', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictions'] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
    },
  })

  const setJoker = useMutation({
    mutationFn: (input: { matchId: string; isJoker: boolean }) =>
      $fetch<{ ok: boolean }>('/api/predictions/joker', { method: 'PUT', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['predictions'] }),
  })

  return { upsert, setJoker }
}
