import { useQuery } from '@tanstack/vue-query'

export interface LeaderboardRow {
  rank: number
  userId: string
  displayName: string
  totalPoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
}

export function useLeaderboard() {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['leaderboard', slug],
    queryFn: () =>
      $fetch<{ rows: LeaderboardRow[] }>('/api/leaderboard', {
        query: slug.value ? { competition: slug.value } : {},
      }).then((r) => r.rows),
  })
}
