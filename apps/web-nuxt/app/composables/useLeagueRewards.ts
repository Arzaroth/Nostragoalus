import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { LeagueRewardDto, LeagueRewardInput, RewardStandingDto, RewardWinnersExportDto } from '#shared/types/rewards'
import { csvFileName, toCsv, withBom } from '~/utils/csv'

// The columns of the winners export, stable across locales: it is a spreadsheet a
// league owner keeps and may feed to something else, not a rendered view.
const EXPORT_HEADER = ['criterion', 'prize', 'player', 'email', 'metric', 'value']

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

  // Owner/moderator: download the current prize holders (with their email) as a
  // CSV. Returns the number of rows written so the caller can say "nobody holds a
  // prize yet" instead of handing over an empty file.
  const exporting = ref(false)
  async function exportWinners(): Promise<number> {
    exporting.value = true
    try {
      const data = await $fetch<RewardWinnersExportDto>(`/api/leagues/${id.value}/rewards/export`)
      if (data.rows.length === 0) return 0
      const csv = toCsv([
        EXPORT_HEADER,
        ...data.rows.map((r) => [r.type, r.prizeLabel, r.displayName, r.email, r.metric, r.value]),
      ])
      const href = URL.createObjectURL(new Blob([withBom(csv)], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = href
      a.download = csvFileName('prizes', data.leagueName, new Date().toISOString().slice(0, 10))
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
      return data.rows.length
    } finally {
      exporting.value = false
    }
  }

  return { standings, save, exportWinners, exporting }
}
