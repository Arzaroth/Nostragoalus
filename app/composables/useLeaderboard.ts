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
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => $fetch<{ rows: LeaderboardRow[] }>('/api/leaderboard').then((r) => r.rows),
  })
}
