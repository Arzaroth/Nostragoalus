import { useQuery } from '@tanstack/vue-query'

// The play-by-play feed is heavy (hundreds of events), so in multiview it is
// fetched only for the focused cell (enabled gate). Keyed by id so it survives a
// focus swap back to the same match, and invalidated by the grid on scores:changed.
export function useMatchTimeline(id: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ['match-timeline', id],
    queryFn: ({ signal }) => $fetch<{ events: unknown[] }>(`/api/matches/${id.value}/timeline`, { signal }).then((r) => r.events),
    enabled,
  })
}
