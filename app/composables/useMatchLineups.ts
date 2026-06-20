import { useQuery } from '@tanstack/vue-query'
import type { MatchLineups } from '#shared/types/match'

export function useMatchLineups(id: Ref<string>) {
  return useQuery({
    queryKey: ['match', id, 'lineups'],
    queryFn: ({ signal }) =>
      $fetch<{ lineups: MatchLineups | null }>(`/api/matches/${id.value}/lineups`, { signal }).then((r) => r.lineups),
  })
}
