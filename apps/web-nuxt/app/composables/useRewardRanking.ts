import { useQuery } from '@tanstack/vue-query'
import type { LeagueRewardCriterion, RewardRankingDto } from '#shared/types/rewards'

// One criterion's live ranking within a league, fetched on demand when the prize
// ranking dialog opens (enabled gate). Keyed per league + criterion.
export function useRewardRanking(
  leagueId: MaybeRefOrGetter<string | null>,
  type: MaybeRefOrGetter<LeagueRewardCriterion | null>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const id = computed(() => toValue(leagueId))
  const criterion = computed(() => toValue(type))
  return useQuery({
    queryKey: ['rewardRanking', id, criterion],
    enabled: computed(() => toValue(enabled) && !!id.value && !!criterion.value),
    // Standings are live: refetch each time the dialog reopens rather than serving
    // the app's 60s-stale cache (overrides the app-level staleTime).
    staleTime: 0,
    queryFn: ({ signal }) =>
      $fetch<RewardRankingDto>(`/api/leagues/${id.value}/rewards/${criterion.value}/ranking`, { signal }),
  })
}
