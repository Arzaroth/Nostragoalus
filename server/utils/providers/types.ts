import type {
  MatchDetail,
  NormalizedBracket,
  NormalizedMatch,
  SquadPlayer,
  TeamMatchStats,
  TeamSeasonStats,
  TopScorer,
} from '../../../shared/types/match'

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
  // Optional: per-match detail (goals, possession) — FIFA exposes this keyless.
  // stageId is optional; FIFA also resolves details from the bare match id.
  getMatchDetail?(opts: { stageId?: string; matchId: string }): Promise<MatchDetail | null>
  // Optional: the knockout bracket projection — FIFA exposes this keyless.
  getBracket?(): Promise<NormalizedBracket | null>
  // Optional: official per-player stats (goals + assists) keyed by any team id in the season.
  getPlayerStats?(opts: { teamId: string }): Promise<TopScorer[]>
  // Optional: squad + head coach + season totals, derived from a sweep over the team's matches.
  getTeamTournament?(opts: { teamRef: string; matches: { stageId: string; matchId: string }[] }): Promise<{
    squad: SquadPlayer[]
    coach: string | null
    stats: TeamSeasonStats | null
  }>
  // Optional: per-match team stats (attempts, passes, distance…) keyed by team id.
  getMatchStats?(opts: { ifesId: string }): Promise<Record<string, TeamMatchStats> | null>
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
