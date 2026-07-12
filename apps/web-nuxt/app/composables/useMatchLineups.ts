import { useQuery } from '@tanstack/vue-query'
import type { MatchLineups } from '#shared/types/match'

export function useMatchLineups(id: Ref<string>) {
  return useQuery({
    queryKey: ['match', id, 'lineups'],
    queryFn: ({ signal }) =>
      $fetch<{ lineups: MatchLineups | null }>(`/api/matches/${id.value}/lineups`, { signal }).then((r) => r.lineups),
    // The XI drops about an hour before kickoff. Poll every minute (matching the
    // route's 60s pending cache) so the tab appears for a page that was opened
    // before the line-up was announced; stop once we have it.
    refetchInterval: (query) => (query.state.data?.available ? false : 60_000),
  })
}
