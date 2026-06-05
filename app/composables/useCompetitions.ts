import { useQuery } from '@tanstack/vue-query'

export interface Competition {
  id: string
  slug: string
  name: string
}

// Cookie-backed so the selected competition survives refresh and is available during SSR.
export function useSelectedCompetition() {
  return useCookie<string | null>('ng-competition', { default: () => null, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    queryFn: () => $fetch<{ competitions: Competition[] }>('/api/competitions').then((r) => r.competitions),
    staleTime: 5 * 60_000,
  })
}
