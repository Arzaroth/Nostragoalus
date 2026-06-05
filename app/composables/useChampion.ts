import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export interface ChampionTeam {
  code: string
  name: string
}

export function useChampion() {
  const slug = useSelectedCompetition()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['champion', slug],
    queryFn: () =>
      $fetch('/api/champion', { query: slug.value ? { competition: slug.value } : {} }),
  })

  const setPick = useMutation({
    mutationFn: (team: ChampionTeam) =>
      $fetch('/api/champion', {
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
