import { useQuery } from '@tanstack/vue-query'
import type { CabinetDto } from '#shared/types/achievements'

// A player's trophy cabinet (trophies + achievements + fridge) for the selected
// competition. Lazy-enabled like useScorers/useStandings so it only fetches when
// its section is shown. Keyed by user + competition so switching either refetches.
export function useCabinet(
  userId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const slug = useSelectedCompetition()
  const id = computed(() => toValue(userId))
  return useQuery({
    queryKey: ['cabinet', id, slug],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<CabinetDto>(`/api/users/${id.value}/cabinet`, {
        query: slug.value ? { competition: slug.value } : {},
        signal,
      }),
  })
}
