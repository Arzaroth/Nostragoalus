import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { LeagueRewardInput, RewardStandingDto } from '#shared/types/rewards'

// A league's prize standings (each criterion's prize + current leader + youHold),
// plus the owner/moderator config mutation.
export function useLeagueRewards(leagueId: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean> = true) {
  const id = computed(() => toValue(leagueId))
  const queryClient = useQueryClient()

  const standings = useQuery({
    queryKey: ['leagueRewards', id],
    enabled,
    queryFn: ({ signal }) => $fetch<RewardStandingDto[]>(`/api/leagues/${id.value}/rewards`, { signal }),
  })

  const save = useMutation({
    mutationFn: (items: LeagueRewardInput[]) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${id.value}/rewards`, { method: 'PUT', body: { items } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagueRewards'] })
      queryClient.invalidateQueries({ queryKey: ['myRewards'] })
    },
  })

  return { standings, save }
}
