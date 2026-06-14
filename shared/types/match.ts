export type MatchStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'PAUSED'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'SUSPENDED'
  | 'AWARDED'

export type AppStage = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD_PLACE' | 'FINAL'

// Single-match rounds carry no joker - the final doubles for everyone, the
// third-place tie scores normally. These helpers keep that rule in one place
// instead of scattered `stage === 'FINAL'` literals across server + client.
export const SINGLE_MATCH_STAGES: AppStage[] = ['FINAL', 'THIRD_PLACE']
export function isSingleMatchStage(stage: AppStage | string | null | undefined): boolean {
  return stage === 'FINAL' || stage === 'THIRD_PLACE'
}
export function countsDouble(stage: AppStage | string | null | undefined): boolean {
  return stage === 'FINAL'
}
export function isKnockout(stage: AppStage | string | null | undefined): boolean {
  return stage != null && stage !== 'GROUP'
}

export type Winner = 'HOME' | 'AWAY' | 'DRAW' | null

export interface Team {
  name: string
  code: string | null
  crest?: string | null
  providerTeamId?: string | null
}

export interface ScorePair {
  home: number | null
  away: number | null
}

export interface Score {
  fullTime: ScorePair
  halfTime?: ScorePair
  extraTime?: ScorePair
  penalties?: ScorePair
}

export interface TopScorer {
  playerName: string
  teamName: string
  teamCode: string | null
  goals: number
  assists: number | null
  penalties: number | null
}

export interface NormalizedMatch {
  providerMatchId: string
  providerStageId?: string | null
  stage: AppStage
  group: string | null
  matchday: number | null
  homeTeam: Team
  awayTeam: Team
  kickoffTime: string
  status: MatchStatus
  score: Score
  winner: Winner
  lastUpdated?: string
}

export interface NormalizedGoal {
  side: 'HOME' | 'AWAY'
  teamId: string | null
  teamName: string
  teamCode: string | null
  playerId: string | null
  playerName: string
  minute: string | null
  goalType: number | null
  ownGoal: boolean
  assistPlayerId: string | null
  assistPlayerName: string | null
}

// A single curated play-by-play entry. `kind` drives the icon/emphasis; `text`
// is the provider's ready-made commentary line. `side` is null for neutral
// markers (period start/end, VAR).
export type TimelineEventKind =
  | 'goal'
  | 'own-goal'
  | 'penalty-goal'
  | 'penalty-missed'
  | 'penalty-awarded'
  | 'assist'
  | 'yellow'
  | 'red'
  | 'second-yellow'
  | 'sub'
  | 'shot'
  | 'foul'
  | 'var'
  | 'period'

// Which period marker a 'period' event represents, so the client labels it in
// its own language rather than echoing the provider's English commentary.
export type PeriodKind = 'kickoff' | 'half-time' | 'second-half' | 'extra-time' | 'full-time'

export interface TimelineEvent {
  kind: TimelineEventKind
  side: 'HOME' | 'AWAY' | null
  minute: string | null
  // Resolved actor name(s) - we phrase the commentary ourselves (localized),
  // never the provider's free text. playerName is the main actor; subs carry
  // playerInName (on) and playerOutName (off).
  playerName: string | null
  playerInName: string | null
  playerOutName: string | null
  // Only set for the 'period' kind: which marker it is.
  periodKind: PeriodKind | null
  // Running score at this point in the match (goals only carry it meaningfully).
  homeScore: number | null
  awayScore: number | null
}

export interface TeamCards {
  yellow: number
  red: number
}

export interface BookingEvent {
  side: 'HOME' | 'AWAY'
  playerId: string | null
  playerName: string
  minute: string | null
  card: 'YELLOW' | 'SECOND_YELLOW' | 'RED'
  // Touchline booking (manager/staff), not a player on the pitch.
  coach?: boolean
}

export interface SubstitutionEvent {
  side: 'HOME' | 'AWAY'
  minute: string | null
  playerOffId: string | null
  playerOffName: string
  playerOnId: string | null
  playerOnName: string
}

export interface MatchDetail {
  // Live clock as the provider reports it, e.g. "47'" (null once final / for
  // providers that don't expose it).
  minute?: string | null
  // At half-time the running clock stops and resets, so the minute is no help -
  // this flag lets the UI show "HT" instead of a bare LIVE.
  halfTime?: boolean
  possessionHome: number | null
  possessionAway: number | null
  attendance: number | null
  stadium: string | null
  cards: { home: TeamCards; away: TeamCards }
  goals: NormalizedGoal[]
  bookings: BookingEvent[]
  substitutions: SubstitutionEvent[]
  // Roster id -> display name, so the timeline (which only carries player ids)
  // can resolve actor names without refetching. Optional: only FIFA fills it.
  playerNames?: Record<string, string>
  ifesId: string | null
  homeTeamId: string | null
  awayTeamId: string | null
}

// Per-team stats for one match (FIFA football-intelligence feed).
export interface TeamMatchStats {
  possession: number | null
  attempts: number | null
  onTarget: number | null
  passes: number | null
  passesCompleted: number | null
  crosses: number | null
  corners: number | null
  fouls: number | null
  offsides: number | null
  distanceKm: number | null
  pressuresApplied: number | null
  forcedTurnovers: number | null
}

export interface SquadPlayer {
  playerId: string
  name: string
  shirtNumber: number | null
  position: 'GK' | 'DF' | 'MF' | 'FW' | null
  captain: boolean
}

// Tournament-wide aggregates for one team (decoded FIFA stat type codes).
export interface TeamSeasonStats {
  goals: number | null
  conceded: number | null
  assists: number | null
  possession: number | null
  attempts: number | null
  onTarget: number | null
  passes: number | null
  passAccuracy: number | null
  crosses: number | null
  corners: number | null
  offsides: number | null
  yellowCards: number | null
  redCards: number | null
}

export interface BracketMatch {
  id?: string | null
  providerMatchId: string
  homeTeam: string
  homeCode: string | null
  awayTeam: string
  awayCode: string | null
  homeScore: number | null
  awayScore: number | null
  homePens: number | null
  awayPens: number | null
  winner: 'HOME' | 'AWAY' | null
  status: MatchStatus
  kickoffTime: string
}

export interface BracketRound {
  name: string
  sequence: number
  matches: BracketMatch[]
}

export interface NormalizedBracket {
  winner: { name: string; code: string | null } | null
  rounds: BracketRound[]
}
