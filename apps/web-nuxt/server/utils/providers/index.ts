import { createProvider } from './factory'
import type { MatchDataProvider } from './types'

export function providerForCompetition(
  competition: { provider: string; externalCompetitionId: string; seasonHint?: string | null; providerSport?: string | null },
  seasonId?: string,
): MatchDataProvider {
  const config = useRuntimeConfig()
  return createProvider({
    provider: competition.provider,
    externalCompetitionId: competition.externalCompetitionId,
    seasonHint: competition.seasonHint,
    // The provider's SUB-FEED, not the competition's sport. They are different
    // vocabularies ('mru' vs 'RUGBY_UNION') behind one field name, and passing
    // the enum here sent every stored rugby competition's adapter the wrong
    // value - harmless only because nothing read it yet.
    sport: competition.providerSport,
    fifaSeasonId: seasonId,
    footballDataToken: config.footballDataToken,
    apiFootballKey: config.apiFootballKey,
  })
}
