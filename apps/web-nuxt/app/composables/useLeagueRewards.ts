import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { LeagueRewardDto, LeagueRewardInput, RewardStandingDto, RewardWinnersExportDto } from '#shared/types/rewards'
import { csvFileName, winnersCsv, withBom } from '~/utils/csv'
import { saveBlob } from '~/utils/download'

// A league's prize standings (each criterion's prize + current leader + youHold),
// plus the owner/moderator config mutation and winners export.
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
      $fetch<{ ok: boolean; rewards: LeagueRewardDto[] }>(`/api/leagues/${id.value}/rewards`, { method: 'PUT', body: { items } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagueRewards'] })
      queryClient.invalidateQueries({ queryKey: ['myRewards'] })
    },
  })

  // Returns the number of rows written so the caller can say "nobody holds a prize
  // yet" instead of handing over an empty file.
  const exporting = ref(false)
  async function exportWinners(): Promise<number> {
    exporting.value = true
    try {
      const data = await $fetch<RewardWinnersExportDto>(`/api/leagues/${id.value}/rewards/export`)
      if (data.rows.length === 0) return 0
      const blob = new Blob([withBom(winnersCsv(data.rows))], { type: 'text/csv;charset=utf-8' })
      saveBlob(blob, csvFileName('prizes', data.leagueName, new Date()))
      return data.rows.length
    } finally {
      exporting.value = false
    }
  }

  return { standings, save, exportWinners, exporting }
}
