import { useQuery } from '@tanstack/vue-query'
import type { LeaderboardRow as ServerLeaderboardRow } from '../../server/utils/leaderboard/service'

// The API adds movement on top of the server row; everything else is the
// canonical server interface (championCode/championPoints included).
export type LeaderboardRow = ServerLeaderboardRow & { movement?: number | null }

export function useLeaderboard(global?: Ref<boolean>) {
  const slug = useSelectedCompetition()
  const isGlobal = global ?? ref(false)
  return useQuery({
    queryKey: ['leaderboard', slug, isGlobal],
    queryFn: () =>
      $fetch<{ rows: LeaderboardRow[] }>('/api/leaderboard', {
        query: isGlobal.value ? { global: 'true' } : slug.value ? { competition: slug.value } : {},
      }).then((r) => r.rows),
  })
}
