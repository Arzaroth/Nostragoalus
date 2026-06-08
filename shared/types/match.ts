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
  possessionHome: number | null
  possessionAway: number | null
  attendance: number | null
  stadium: string | null
  cards: { home: TeamCards; away: TeamCards }
  goals: NormalizedGoal[]
  bookings: BookingEvent[]
  substitutions: SubstitutionEvent[]
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
