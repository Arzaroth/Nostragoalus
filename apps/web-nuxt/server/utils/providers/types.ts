import type {
  MatchDetail,
  MatchLineups,
  NormalizedBracket,
  NormalizedMatch,
  SquadPlayer,
  TeamMatchStats,
  TeamSeasonStats,
  TimelineEvent,
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

// One competition a provider carries, as returned by discoverCompetitions().
// This is a catalog entry, not a supported competition: whether the app can
// actually ingest it is decided by probing its real fixtures, never by this.
export interface DiscoveredCompetition {
  // What a competition row would store as externalCompetitionId for this provider.
  externalCompetitionId: string
  name: string
  // The provider's current season for it, when it publishes one.
  seasonHint: string | null
  // The provider's own claim about shape, surfaced to the admin as a hint and
  // nothing more. ESPN marks the Champions League a tournament even though its
  // league phase is a single table, so this cannot gate anything.
  isTournament: boolean | null
}

export interface MatchDataProvider {
  readonly meta: ProviderMeta
  // Optional: the competitions this provider carries, for the admin's
  // add-a-competition flow. Not every provider can enumerate - UEFA's ids are a
  // curated handful and the offline fixture provider has exactly one - so the
  // absence of this method means "ask an admin to type the id", not "broken".
  discoverCompetitions?(): Promise<DiscoveredCompetition[]>
  listFixtures(opts: ListFixturesOptions): Promise<NormalizedMatch[]>
  getMatchesByDate(date: string): Promise<NormalizedMatch[]>
  getLiveMatches(): Promise<NormalizedMatch[]>
  // Optional: aggregate top scorers for the season (not all providers expose this).
  getTopScorers?(opts: ListFixturesOptions): Promise<TopScorer[]>
  // Optional: per-match detail (goals, possession) - FIFA exposes this keyless.
  // stageId is optional; FIFA also resolves details from the bare match id.
  getMatchDetail?(opts: { stageId?: string; matchId: string }): Promise<MatchDetail | null>
  // Optional: starting XI + bench (+ formation when the feed has it) for one
  // match. FIFA carries it inside the same detail doc as getMatchDetail; UEFA
  // has a dedicated lineups endpoint. Returns null/available:false until the
  // official line-ups drop (~1h before kickoff).
  getMatchLineups?(opts: { stageId?: string; matchId: string }): Promise<MatchLineups | null>
  // Optional: the knockout bracket projection - FIFA exposes this keyless.
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
  // Optional: curated play-by-play timeline (goals, cards, subs, shots, VAR…) -
  // FIFA exposes this keyless. homeTeamId/awayTeamId map each event to a side;
  // playerNames resolves the actor ids the feed carries to display names.
  getMatchTimeline?(opts: { matchId: string; homeTeamId?: string | null; awayTeamId?: string | null; playerNames?: Record<string, string>; language?: string | null }): Promise<TimelineEvent[]>
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
