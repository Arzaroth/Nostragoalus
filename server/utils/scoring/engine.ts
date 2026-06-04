import { basePointsFor, classifyTier, outcomeOf, type BaseTier, type Outcome, type Scoreline } from './tiers'
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
    const hit = byExact
      ? pred.home === actual.home && pred.away === actual.away
      : outcomeOf(pred) === hist.actualOutcome
    const matchCount = byExact ? hist.exactCount : hist.outcomeCount
    const { bonus, share } = crowdBonus(hit, matchCount, hist.total, rules.crowdTiers, rules.crowdMinDenominator)
    return { bonus, source: 'CROWD', share }
  }

  if (rules.bonusSource === 'ODDS') {
    const byExact = rules.oddsAppliesTo === 'EXACT'
    const hit = byExact
      ? pred.home === actual.home && pred.away === actual.away
      : outcomeOf(pred) === hist.actualOutcome
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

  const multiplier = p.isJoker ? input.rules.jokerMultiplier : 1
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

export function scorePredictions(input: ScoreMatchInput): PredictionScore[] {
  const { actual, predictions } = input
  const actualOutcome = outcomeOf(actual)

  let exactCount = 0
  let outcomeCount = 0
  for (const p of predictions) {
    if (p.home === actual.home && p.away === actual.away) exactCount += 1
    if (outcomeOf({ home: p.home, away: p.away }) === actualOutcome) outcomeCount += 1
  }

  const hist: Histogram = { exactCount, outcomeCount, total: predictions.length, actualOutcome }
  return predictions.map((p) => scoreOne(input, hist, p))
}
