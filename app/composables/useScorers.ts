import { useQuery } from '@tanstack/vue-query'
import type { TopScorer } from '#shared/types/match'

// Per-player goals + assists for the selected competition (the Stats view's
// scorer/assist rankings). `enabled` defers the fetch until the Stats tab is
// shown - the toggle's visibility is decided from the already-loaded fixtures,
// not this query. The endpoint already returns rows sorted by goals; the assist
// ranking re-sorts the same set client-side.
export function useScorers(enabled: MaybeRefOrGetter<boolean> = true) {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['scorers', slug],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<{ scorers: TopScorer[] }>('/api/competitions/scorers', {
        query: slug.value ? { competition: slug.value } : {},
        signal,
      }).then((r) => r.scorers),
  })
}
