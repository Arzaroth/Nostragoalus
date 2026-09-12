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

// Upper bounds of the winning margins that count as "the same margin", used by
// the DIFF tier. Null is football: every margin is its own band, so DIFF means
// the exact goal difference, which is the behaviour this generalizes.
//
// Rugby needs bands because exact-score degenerates there - nobody calls 27-24,
// so EXACT collapses into luck and DIFF-by-exact-margin is barely easier. With
// [7, 14] a margin of 1-7 (a converted try), 8-14 and 15+ each count as one
// band, which is how the sport itself talks about a result.
export type MarginBands = number[] | null

export function marginBandOf(diff: number, bands: MarginBands): number {
  const margin = Math.abs(diff)
  if (!bands || bands.length === 0) return margin
  for (let i = 0; i < bands.length; i++) {
    if (margin <= bands[i]!) return i
  }
  return bands.length
}

export function classifyTier(prediction: Scoreline, actual: Scoreline, bands: MarginBands = null): BaseTier {
  if (prediction.home === actual.home && prediction.away === actual.away) return 'EXACT'
  if (outcomeOf(prediction) !== outcomeOf(actual)) return 'MISS'
  // Outcomes already match, so both margins have the same sign and comparing
  // their bands compares like with like. A draw is margin 0 in every banding.
  if (marginBandOf(goalDifference(prediction), bands) === marginBandOf(goalDifference(actual), bands)) return 'DIFF'
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
