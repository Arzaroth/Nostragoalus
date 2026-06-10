import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export interface BestScorerPickInput {
  playerId: string
  playerName: string
  teamCode: string | null
  teamName: string
}

export interface BestScorerData {
  competition: { id: string; slug: string; name: string } | null
  teams: { code: string; name: string }[]
  myPick: (BestScorerPickInput & { awardedPoints: number }) | null
  locked: boolean
}

export function useBestScorer() {
  const slug = useSelectedCompetition()
  const queryClient = useQueryClient()

  // Explicit response generic keeps $fetch off its route-literal inference path
  // (which recurses to "excessive stack depth" on these endpoints).
  const query = useQuery({
    queryKey: ['bestScorer', slug],
    queryFn: ({ signal }) =>
      $fetch<BestScorerData>('/api/best-scorer', { query: slug.value ? { competition: slug.value } : {}, signal }),
  })

  const setPick = useMutation({
    mutationFn: (pick: BestScorerPickInput) =>
      $fetch<{ ok: boolean }>('/api/best-scorer', {
        method: 'PUT',
        body: { competition: slug.value, ...pick },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bestScorer'] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })

  return { query, setPick }
}
