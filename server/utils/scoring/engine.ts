import { basePointsFor, classifyTier, outcomeOf, predictionHits, type BaseTier, type Outcome, type Scoreline } from './tiers'
import { crowdBonus, oddsBonus } from './bonus'
import type { BonusSource, ScoringRules } from './config'

export interface PredictionInput {
  id: string
  home: number
  away: number
  isJoker: boolean
}

export interface PredictionScore {
  id: string
  baseTier: BaseTier
  basePoints: number
  bonusPoints: number
  bonusSource: BonusSource
  crowdShare: number | null
  jokerMultiplier: number
  totalPoints: number
}

export interface ScoreMatchInput {
  actual: Scoreline
  predictions: PredictionInput[]
  rules: ScoringRules
  actualOutcomeOdds?: number | null
  // Single-match rounds (the final): the multiplier applies to everyone -
  // there is no joker to place when there is only one match to place it on.
  forceJoker?: boolean
}

interface Histogram {
  exactCount: number
  outcomeCount: number
  total: number
  actualOutcome: Outcome
}

function computeBonus(
  pred: Scoreline,
  actual: Scoreline,
  rules: ScoringRules,
  hist: Histogram,
  actualOutcomeOdds: number | null,
): { bonus: number; source: BonusSource; share: number | null } {
  if (rules.bonusSource === 'CROWD') {
    const byExact = rules.crowdMatchBasis === 'EXACT'
    const hit = predictionHits(pred, actual, byExact)
    const matchCount = byExact ? hist.exactCount : hist.outcomeCount
    const { bonus, share } = crowdBonus(hit, matchCount, hist.total, rules.crowdTiers, rules.crowdMinDenominator)
    return { bonus, source: 'CROWD', share }
  }

  if (rules.bonusSource === 'ODDS') {
    const byExact = rules.oddsAppliesTo === 'EXACT'
    const hit = predictionHits(pred, actual, byExact)
    return { bonus: oddsBonus(hit, actualOutcomeOdds, rules.oddsTiers), source: 'ODDS', share: null }
  }

  return { bonus: 0, source: 'NONE', share: null }
}

function scoreOne(input: ScoreMatchInput, hist: Histogram, p: PredictionInput): PredictionScore {
  const pred: Scoreline = { home: p.home, away: p.away }
  const baseTier = classifyTier(pred, input.actual)
  const basePoints = basePointsFor(baseTier, input.rules.base)
  const { bonus, source, share } = computeBonus(
    pred,
    input.actual,
    input.rules,
    hist,
    input.actualOutcomeOdds ?? null,
  )

  const multiplier = p.isJoker || input.forceJoker ? input.rules.jokerMultiplier : 1
  const scalable = input.rules.jokerAppliesToBonus ? basePoints + bonus : basePoints
  const fixed = input.rules.jokerAppliesToBonus ? 0 : bonus
  const totalPoints = Math.round(scalable * multiplier + fixed)

  return {
    id: p.id,
    baseTier,
    basePoints,
    bonusPoints: bonus,
    bonusSource: source,
    crowdShare: share,
    jokerMultiplier: multiplier,
    totalPoints,
  }
}

function buildHistogram(actual: Scoreline, predictions: PredictionInput[]): Histogram {
  let exactCount = 0
  let outcomeCount = 0
  for (const p of predictions) {
    if (predictionHits(p, actual, true)) exactCount += 1
    if (predictionHits(p, actual, false)) outcomeCount += 1
  }
  return { exactCount, outcomeCount, total: predictions.length, actualOutcome: outcomeOf(actual) }
}

export function scorePredictions(input: ScoreMatchInput): PredictionScore[] {
  const hist = buildHistogram(input.actual, input.predictions)
  return input.predictions.map((p) => scoreOne(input, hist, p))
}

// Scores a pick that is not part of the crowd (the consensus bot): it must not
// sit in its own rarity denominator, or being the consensus would dilute the
// very bonus it is measured against.
export function scoreSyntheticPrediction(input: ScoreMatchInput, p: PredictionInput): PredictionScore {
  return scoreOne(input, buildHistogram(input.actual, input.predictions), p)
}
