import { useQuery } from '@tanstack/vue-query'
import type { AnalyticsResponse } from '#shared/types/analytics'

// The signed-in user's prediction bias report for the selected competition.
// Recomputed cheaply from scored picks, so it can go stale as new results land;
// invalidated on the ['analytics'] key alongside the leaderboard when scores
// change would be ideal, but the app-level staleTime already refreshes it.
export function useAnalytics(enabled: MaybeRefOrGetter<boolean> = true) {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['analytics', slug],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<AnalyticsResponse>('/api/me/analytics', {
        query: slug.value ? { competition: slug.value } : {},
        signal,
      }),
  })
}
