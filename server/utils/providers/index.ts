import { createProvider } from './factory'
import type { MatchDataProvider } from './types'

export function providerForCompetition(
  competition: { provider: string; externalCompetitionId: string },
  seasonId?: string,
): MatchDataProvider {
  const config = useRuntimeConfig()
  return createProvider({
    provider: competition.provider,
    fifaSeasonId: seasonId,
    footballDataToken: config.footballDataToken,
    apiFootballKey: config.apiFootballKey,
  })
}
