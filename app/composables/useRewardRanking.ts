import { useQuery } from '@tanstack/vue-query'
import type { CompetitionAwardType } from '#shared/types/achievements'
import type { RewardRankingDto } from '#shared/types/rewards'

// One criterion's live ranking within a league, fetched on demand when the prize
// ranking dialog opens (enabled gate). Keyed per league + criterion.
export function useRewardRanking(
  leagueId: MaybeRefOrGetter<string | null>,
  type: MaybeRefOrGetter<CompetitionAwardType | null>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const id = computed(() => toValue(leagueId))
  const criterion = computed(() => toValue(type))
  return useQuery({
    queryKey: ['rewardRanking', id, criterion],
    enabled: computed(() => toValue(enabled) && !!id.value && !!criterion.value),
    queryFn: ({ signal }) =>
      $fetch<RewardRankingDto>(`/api/leagues/${id.value}/rewards/${criterion.value}/ranking`, { signal }),
  })
}
