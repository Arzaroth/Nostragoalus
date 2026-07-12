import { useQuery } from '@tanstack/vue-query'
import type { PastPickCounterfactual } from '#shared/types/past-pick'

// The signed-in user's OWN earlier-pick counterfactual for one match. The
// endpoint is owner-gated server-side (it requires the session user), so this
// never fetches another user's history. Client-only and enabled only once the
// match has started, since the picks stay sealed until kickoff.
export function useMyPastPicks(id: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ['match', id, 'my-past-picks'],
    queryFn: ({ signal }) => $fetch<PastPickCounterfactual>(`/api/matches/${id.value}/my-past-picks`, { signal }),
    enabled: computed(() => import.meta.client && enabled.value),
  })
}
