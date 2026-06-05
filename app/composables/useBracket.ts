import { useQuery } from '@tanstack/vue-query'

export function useBracket() {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['bracket', slug],
    queryFn: () =>
      $fetch<{ bracket: any }>('/api/competitions/bracket', {
        query: slug.value ? { competition: slug.value } : {},
      }).then((r) => r.bracket),
    staleTime: 5 * 60_000,
  })
}
