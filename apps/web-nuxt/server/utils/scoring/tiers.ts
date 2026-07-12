export type Outcome = 'HOME' | 'DRAW' | 'AWAY'
export type BaseTier = 'EXACT' | 'DIFF' | 'OUTCOME' | 'MISS'

export interface Scoreline {
  home: number
  away: number
}

export interface BasePoints {
  exact: number
  diff: number
  outcome: number
  miss: number
}

export const DEFAULT_BASE_POINTS: BasePoints = {
  exact: 3,
  diff: 2,
  outcome: 1,
  miss: 0,
}

export function outcomeOf({ home, away }: Scoreline): Outcome {
  if (home > away) return 'HOME'
  if (home < away) return 'AWAY'
  return 'DRAW'
}

export function goalDifference({ home, away }: Scoreline): number {
  return home - away
}

export function classifyTier(prediction: Scoreline, actual: Scoreline): BaseTier {
  if (prediction.home === actual.home && prediction.away === actual.away) return 'EXACT'
  if (outcomeOf(prediction) !== outcomeOf(actual)) return 'MISS'
  if (goalDifference(prediction) === goalDifference(actual)) return 'DIFF'
  return 'OUTCOME'
}

export function basePointsFor(tier: BaseTier, points: BasePoints = DEFAULT_BASE_POINTS): number {
  switch (tier) {
    case 'EXACT':
      return points.exact
    case 'DIFF':
      return points.diff
    case 'OUTCOME':
      return points.outcome
    case 'MISS':
      return points.miss
  }
}

// Whether a prediction "hits" by a given basis: an exact-score match, or just
// the right outcome. Used for the crowd/odds rarity bonus and the histogram.
export function predictionHits(pred: Scoreline, actual: Scoreline, byExact: boolean): boolean {
  return byExact ? pred.home === actual.home && pred.away === actual.away : outcomeOf(pred) === outcomeOf(actual)
}
