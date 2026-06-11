import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export interface ChampionTeam {
  code: string
  name: string
  fifaRank: number | null
  potentialPoints: number
}

export interface ChampionData {
  competition: { id: string; slug: string; name: string } | null
  teams: ChampionTeam[]
  myPick: {
    teamCode: string | null
    teamName: string
    fifaRank: number | null
    potentialPoints: number
    awardedPoints: number
  } | null
  locked: boolean
}

export function useChampion() {
  const slug = useSelectedCompetition()
  const queryClient = useQueryClient()

  // Explicit response generic keeps $fetch off its route-literal inference path
  // (which recurses to "excessive stack depth" on these endpoints).
  const query = useQuery({
    queryKey: ['champion', slug],
    queryFn: ({ signal }) =>
      $fetch<ChampionData>('/api/champion', { query: slug.value ? { competition: slug.value } : {}, signal }),
  })

  const setPick = useMutation({
    mutationFn: (team: ChampionTeam) =>
      $fetch<{ ok: boolean }>('/api/champion', {
        method: 'PUT',
        body: { competition: slug.value, teamCode: team.code, teamName: team.name },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['champion'] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })

  return { query, setPick }
}
