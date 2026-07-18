import { useQuery } from '@tanstack/vue-query'
import type { MatchLineups } from '#shared/types/match'

export function useMatchLineups(id: Ref<string>, live?: Ref<boolean>) {
  return useQuery({
    queryKey: ['match', id, 'lineups'],
    queryFn: ({ signal }) =>
      $fetch<{ lineups: MatchLineups | null }>(`/api/matches/${id.value}/lineups`, { signal }).then((r) => r.lineups),
    // The XI drops about an hour before kickoff. Poll every minute (matching the
    // route's 60s pending cache) so the tab appears for a page that was opened
    // before the line-up was announced. Keep polling while the match is still
    // live/upcoming, since the feed re-shapes the XI (formation corrections,
    // subs) after it first lands; stop once we have it and there's nothing left
    // to update.
    refetchInterval: (query) => (query.state.data?.available && !live?.value ? false : 60_000),
  })
}
