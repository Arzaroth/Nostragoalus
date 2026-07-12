import { createProvider } from './factory'
import type { MatchDataProvider } from './types'

export function providerForCompetition(
  competition: { provider: string; externalCompetitionId: string; seasonHint?: string | null },
  seasonId?: string,
): MatchDataProvider {
  const config = useRuntimeConfig()
  return createProvider({
    provider: competition.provider,
    externalCompetitionId: competition.externalCompetitionId,
    seasonHint: competition.seasonHint,
    fifaSeasonId: seasonId,
    footballDataToken: config.footballDataToken,
    apiFootballKey: config.apiFootballKey,
  })
}
