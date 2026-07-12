import { useQuery } from '@tanstack/vue-query'
import { DEFAULT_COMPETITION } from '#shared/competition'

export interface Competition {
  id: string
  slug: string
  name: string
}

export { DEFAULT_COMPETITION }

// The active competition is the `[competition]` path segment. On un-prefixed
// pages (account/admin/login) it falls back to the last-viewed one (cookie).
export function useSelectedCompetition() {
  const route = useRoute()
  const last = useLastCompetition()
  return computed(() => (route.params.competition as string) || last.value || DEFAULT_COMPETITION)
}

// Remembered across navigations so "/" and legacy links land on a sensible competition.
export function useLastCompetition() {
  return useCookie<string>('ng-competition', { default: () => DEFAULT_COMPETITION, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    // signal: vue-query aborts it when the last subscriber unmounts, so a page
    // switch cancels the request instead of letting it run to completion.
    queryFn: ({ signal }) => $fetch<{ competitions: Competition[] }>('/api/competitions', { signal }).then((r) => r.competitions),
    staleTime: 5 * 60_000,
  })
}
