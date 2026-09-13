import { fifaProvider } from './fifa'
import { uefaProvider } from './uefa'
import { espnProvider } from './espn'
import { footballDataProvider } from './football-data'
import { fixtureProvider } from './fixture'
import { worldRugbyProvider, type WorldRugbySport } from './worldrugby'
import type { MatchDataProvider } from './types'
import { ValidationError } from '../errors'

export interface ProviderSelection {
  provider: string
  externalCompetitionId?: string
  seasonHint?: string | null
  fifaSeasonId?: string
  footballDataToken?: string
  apiFootballKey?: string
  // The provider's sub-feed, where it has several (World Rugby).
  sport?: string | null
  fetchImpl?: typeof fetch
}

// The providers a competition may be bound to, as an admin may name them.
// 'fixture' is deliberately absent: it serves canned offline data for the e2e
// stack, so binding a real competition to it would show invented matches.
export const MATCH_PROVIDERS = ['fifa', 'uefa', 'espn', 'football-data', 'worldrugby'] as const
export type MatchProviderKey = (typeof MATCH_PROVIDERS)[number]

export function createProvider(selection: ProviderSelection): MatchDataProvider {
  if (selection.provider === 'fifa') {
    return fifaProvider({
      seasonId: selection.fifaSeasonId || '285023',
      competitionId: selection.externalCompetitionId || '17',
      fetchImpl: selection.fetchImpl,
    })
  }

  if (selection.provider === 'football-data') {
    if (!selection.footballDataToken) {
      // A ValidationError, not a bare Error: the admin screen offers every
      // provider now, so this is reachable by clicking one that the deploy
      // never configured. Unmapped it surfaces as a 500 the admin cannot tell
      // from a bad competition id.
      throw new ValidationError('football-data provider requires NUXT_FOOTBALL_DATA_TOKEN')
    }
    return footballDataProvider({
      token: selection.footballDataToken,
      competition: selection.externalCompetitionId || 'WC',
      fetchImpl: selection.fetchImpl,
    })
  }

  if (selection.provider === 'uefa') {
    return uefaProvider({
      seasonYear: selection.seasonHint || '2024',
      competitionId: selection.externalCompetitionId || '3',
      fetchImpl: selection.fetchImpl,
    })
  }

  if (selection.provider === 'espn') {
    return espnProvider({
      league: selection.externalCompetitionId || 'fifa.world',
      season: selection.seasonHint,
      fetchImpl: selection.fetchImpl,
    })
  }

  if (selection.provider === 'worldrugby') {
    return worldRugbyProvider({
      eventId: selection.externalCompetitionId || '',
      sport: (selection.sport as WorldRugbySport | null | undefined) ?? null,
      fetchImpl: selection.fetchImpl,
    })
  }

  // Offline canned data for the e2e stack (see fixture.ts).
  if (selection.provider === 'fixture') {
    return fixtureProvider()
  }

  if (selection.provider === 'api-football') {
    throw new Error('api-football adapter is not implemented yet')
  }

  throw new Error(`unknown match provider: ${selection.provider}`)
}
