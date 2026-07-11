import { useQuery } from '@tanstack/vue-query'
import type { H2HResponse } from '#shared/types/h2h'

// Head-to-head comparison of two players for the selected competition. Disabled
// until both ids are known; 'me' is accepted for either to mean the viewer.
export function useHeadToHead(
  aId: MaybeRefOrGetter<string | null>,
  bId: MaybeRefOrGetter<string | null>,
) {
  const slug = useSelectedCompetition()
  const a = computed(() => toValue(aId))
  const b = computed(() => toValue(bId))
  return useQuery({
    queryKey: ['head-to-head', slug, a, b],
    enabled: computed(() => !!a.value && !!b.value && a.value !== b.value),
    queryFn: ({ signal }) =>
      $fetch<H2HResponse>('/api/head-to-head', {
        query: { a: a.value, b: b.value, ...(slug.value ? { competition: slug.value } : {}) },
        signal,
      }),
  })
}
