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
    repicked: boolean
    originalTeamCode: string | null
    originalTeamName: string | null
  } | null
  locked: boolean
  secondChance: { open: boolean; closesAt: string | null }
}

export function useChampion() {
  return useMetaPick<ChampionData, ChampionTeam & { repick?: boolean }>({
    key: 'champion',
    endpoint: '/api/champion',
    buildBody: (input) => ({ teamCode: input.code, teamName: input.name, repick: input.repick }),
  })
}
