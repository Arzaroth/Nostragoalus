import { fifaProvider } from './fifa'
import { uefaProvider } from './uefa'
import { footballDataProvider } from './football-data'
import type { MatchDataProvider } from './types'

export interface ProviderSelection {
  provider: string
  externalCompetitionId?: string
  seasonHint?: string | null
  fifaSeasonId?: string
  footballDataToken?: string
  apiFootballKey?: string
  fetchImpl?: typeof fetch
}

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
      throw new Error('football-data provider requires NUXT_FOOTBALL_DATA_TOKEN')
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

  if (selection.provider === 'api-football') {
    throw new Error('api-football adapter is not implemented yet')
  }

  throw new Error(`unknown match provider: ${selection.provider}`)
}
