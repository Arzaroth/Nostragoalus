import type { NormalizedMatch, TopScorer } from '../../../shared/types/match'

export interface ListFixturesOptions {
  season: string
}

export interface ProviderMeta {
  name: string
  rateLimitPerMin: number
  dailyCap: number | null
}

export interface MatchDataProvider {
  readonly meta: ProviderMeta
  listFixtures(opts: ListFixturesOptions): Promise<NormalizedMatch[]>
  getMatchesByDate(date: string): Promise<NormalizedMatch[]>
  getLiveMatches(): Promise<NormalizedMatch[]>
  // Optional: aggregate top scorers for the season (not all providers expose this).
  getTopScorers?(opts: ListFixturesOptions): Promise<TopScorer[]>
}

export class ProviderRateLimitError extends Error {
  constructor(public readonly retryAfterMs?: number) {
    super('provider_rate_limited')
    this.name = 'ProviderRateLimitError'
  }
}

export class ProviderUpstreamError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ProviderUpstreamError'
  }
}
