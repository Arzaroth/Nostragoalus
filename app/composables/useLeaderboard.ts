import { useQuery } from '@tanstack/vue-query'
import type { LeaderboardRow as ServerLeaderboardRow } from '../../server/utils/leaderboard/service'

// The API adds movement on top of the server row; everything else is the
// canonical server interface (championCode/championPoints included).
export type LeaderboardRow = ServerLeaderboardRow & { movement?: number | null }

export function useLeaderboard(global?: Ref<boolean>, leagueId?: Ref<string | null>) {
  const slug = useSelectedCompetition()
  const isGlobal = global ?? ref(false)
  const league = leagueId ?? ref(null)
  return useQuery({
    // league is part of the key: switching the pill refetches and keeps the
    // previous scope cached for an instant toggle back.
    queryKey: ['leaderboard', slug, isGlobal, league],
    queryFn: ({ signal }) =>
      $fetch<{ rows: LeaderboardRow[] }>('/api/leaderboard', {
        query: isGlobal.value
          ? { global: 'true' }
          : league.value
            ? { league: league.value }
            : slug.value
              ? { competition: slug.value }
              : {},
        signal,
      }).then((r) => r.rows),
  })
}
