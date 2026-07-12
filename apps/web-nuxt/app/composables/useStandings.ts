import { useQuery } from '@tanstack/vue-query'
import type { GroupStandings } from '../../server/utils/stats/standings'

// All group-stage tables for the selected competition. Plain numbers/strings, so
// no Serialized wrapper needed. `enabled` lets the caller defer the fetch until
// the standings view is actually shown (the toggle's visibility is decided from
// the already-loaded fixtures, not this query).
export function useStandings(enabled: MaybeRefOrGetter<boolean> = true) {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['standings', slug],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<{ groups: GroupStandings[] }>('/api/competitions/standings', {
        query: slug.value ? { competition: slug.value } : {},
        signal,
      }).then((r) => r.groups),
  })
}
