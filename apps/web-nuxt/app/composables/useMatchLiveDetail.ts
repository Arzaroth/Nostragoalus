import { useQuery } from '@tanstack/vue-query'

// Client-side live detail (goals, minute, cards, stats) for a single match, keyed
// so several multiview cells showing the same match share one fetch. No socket of
// its own: the grid's single useLiveMatches subscription invalidates this on
// scores:changed. `enabled` lets the caller skip matches that haven't kicked off.
export function useMatchLiveDetail(id: Ref<string>, enabled?: Ref<boolean>) {
  return useQuery({
    queryKey: ['match-live-detail', id],
    queryFn: ({ signal }) => $fetch<{ detail: unknown }>(`/api/matches/${id.value}/live-detail`, { signal }).then((r) => r.detail),
    enabled,
  })
}
