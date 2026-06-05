import { useQuery } from '@tanstack/vue-query'

export interface Competition {
  id: string
  slug: string
  name: string
}

export function useSelectedCompetition() {
  return useState<string | null>('competition-slug', () => null)
}

export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    queryFn: () => $fetch<{ competitions: Competition[] }>('/api/competitions').then((r) => r.competitions),
    staleTime: 5 * 60_000,
  })
}
