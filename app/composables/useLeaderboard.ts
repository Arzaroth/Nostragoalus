import { useQuery } from '@tanstack/vue-query'

export interface LeaderboardRow {
  rank: number
  userId: string
  displayName: string
  image?: string | null
  totalPoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
  movement?: number | null
}

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
