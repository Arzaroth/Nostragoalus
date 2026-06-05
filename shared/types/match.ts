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

export interface MatchDetail {
  possessionHome: number | null
  possessionAway: number | null
  goals: NormalizedGoal[]
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
