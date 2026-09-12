import { createProvider } from './factory'
import type { MatchDataProvider } from './types'

export function providerForCompetition(
  competition: { provider: string; externalCompetitionId: string; seasonHint?: string | null; sport?: string | null },
  seasonId?: string,
): MatchDataProvider {
  const config = useRuntimeConfig()
  return createProvider({
    provider: competition.provider,
    externalCompetitionId: competition.externalCompetitionId,
    seasonHint: competition.seasonHint,
    sport: competition.sport,
    fifaSeasonId: seasonId,
    footballDataToken: config.footballDataToken,
    apiFootballKey: config.apiFootballKey,
  })
}
