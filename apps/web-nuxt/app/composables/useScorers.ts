import { useQuery } from '@tanstack/vue-query'
import type { PlayerRankings } from '#shared/types/match'

// Per-player rankings for the selected competition (the Stats view's two boards:
// top scorers by goals, top assists by assists). `enabled` defers the fetch
// until the Stats tab is shown - the toggle's visibility is decided from the
// already-loaded fixtures, not this query. The endpoint ranks and slices each
// board on its own metric, so the assist board isn't capped to the goals top-N.
export function useScorers(enabled: MaybeRefOrGetter<boolean> = true) {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['scorers', slug],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<PlayerRankings>('/api/competitions/scorers', {
        query: slug.value ? { competition: slug.value } : {},
        signal,
      }),
  })
}
