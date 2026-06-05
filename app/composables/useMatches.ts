import { useQuery } from '@tanstack/vue-query'

export interface MatchListItem {
  id: string
  stage: string
  group: string | null
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  kickoffTime: string
  status: string
  fullTimeHome: number | null
  fullTimeAway: number | null
  winner: string | null
  scoringState: string
  roundId: string
  roundLabel: string
  matchday: number | null
  roundSortOrder: number
  isLocked: boolean
}

export function useMatches() {
  const slug = useSelectedCompetition()
  return useQuery({
    queryKey: ['matches', slug],
    queryFn: () =>
      $fetch<{ matches: MatchListItem[] }>('/api/matches', {
        query: slug.value ? { competition: slug.value } : {},
      }).then((r) => r.matches),
  })
}
