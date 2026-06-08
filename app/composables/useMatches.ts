import { useQuery } from '@tanstack/vue-query'
import type { Serialized } from '../../shared/types/serialized'
import type { listMatches } from '../../server/utils/matches/service'

// Derived from the server query (+ isLocked, which the API computes per request).
export type MatchListItem = Serialized<Awaited<ReturnType<typeof listMatches>>[number]> & {
  isLocked: boolean
}

export function useMatches() {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['matches', slug],
    queryFn: () =>
      $fetch<{ matches: MatchListItem[] }>('/api/matches', {
        query: slug.value ? { competition: slug.value } : {},
      }).then((r) => r.matches),
  })
}
