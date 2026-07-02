import { useQuery } from '@tanstack/vue-query'
import type { WrappedResponse } from '#shared/types/wrapped'

// The signed-in user's Tournament Wrapped for the selected competition. The
// recap is frozen once the final is decided, so a long staleTime spares the
// heavy server aggregation on every revisit.
export function useWrapped(enabled: MaybeRefOrGetter<boolean> = true) {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['wrapped', slug],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      $fetch<WrappedResponse>('/api/me/wrapped', {
        query: slug.value ? { competition: slug.value } : {},
        signal,
      }),
  })
}
