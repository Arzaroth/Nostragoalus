export interface BestScorerPickInput {
  playerId: string
  playerName: string
  teamCode: string | null
  teamName: string
}

export interface BestScorerData {
  competition: { id: string; slug: string; name: string } | null
  teams: { code: string; name: string }[]
  myPick:
    | (BestScorerPickInput & {
        awardedPoints: number
        repicked: boolean
        originalPlayerName: string | null
        originalTeamCode: string | null
      })
    | null
  locked: boolean
  secondChance: { open: boolean; closesAt: string | null }
}

export function useBestScorer() {
  return useMetaPick<BestScorerData, BestScorerPickInput & { repick?: boolean }>({
    key: 'bestScorer',
    endpoint: '/api/best-scorer',
    buildBody: (input) => ({ ...input }),
  })
}
