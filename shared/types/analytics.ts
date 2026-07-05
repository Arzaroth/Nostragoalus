// Personal analytics / bias detector: the signed-in user's prediction
// tendencies measured against what actually happened, for one competition.
// Unlike Wrapped this is NOT gated on the final - it reads whatever scored
// picks exist so far, so it is useful mid-tournament.

export interface TierCounts {
  exact: number
  diff: number
  outcome: number
  miss: number
}

export interface OutcomeCounts {
  home: number
  draw: number
  away: number
}

export interface TeamBias {
  code: string | null
  name: string
  // How many of the user's scored picks involved this team.
  sample: number
  // Share of those matches the user predicted this team to win (0..1).
  predictedWinRate: number
  // Share this team actually won (0..1).
  actualWinRate: number
  // predictedWinRate - actualWinRate: positive = the user over-rates the team.
  delta: number
}

export interface RoundAccuracy {
  label: string
  order: number
  picks: number
  // Share of the round's picks that were at least a correct outcome (0..1).
  accuracy: number
  points: number
}

export interface PickHighlight {
  home: string
  away: string
  homeCode: string | null
  awayCode: string | null
  predicted: string
  actual: string
  points: number
  tier: keyof TierCounts
  isJoker: boolean
}

export interface AnalyticsResponse {
  competitionName: string
  // False when the user has no scored picks yet: the page shows an empty state.
  hasData: boolean
  totalPicks: number
  totalPoints: number
  avgPoints: number
  tiers: TierCounts
  // (exact + diff + outcome) / totalPicks, 0..1.
  accuracy: number
  exactRate: number
  goals: {
    // Mean total goals per match the user predicted vs what happened.
    predictedAvg: number
    actualAvg: number
    // predictedAvg - actualAvg: positive = the user over-predicts goals.
    lean: number
  }
  outcomeLean: {
    predicted: OutcomeCounts
    actual: OutcomeCounts
    // Percentage points (predicted% - actual%) for home wins and draws.
    // Positive homeBias = leans on the home team; negative drawGap = draw-blind.
    homeBiasPct: number
    drawGapPct: number
  }
  teams: {
    overrated: TeamBias[]
    underrated: TeamBias[]
  }
  overTime: RoundAccuracy[]
  bestCall: PickHighlight | null
  worstMiss: PickHighlight | null
}
