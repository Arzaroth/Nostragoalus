// Vectors for the scoring engine - the deterministic points computation a Dart
// client would reimplement to show scores. The full ScoringRules config is
// frozen into each vector, so a case is self-contained.
import { DEFAULT_RULES, type ScoringRules } from '../../../server/utils/scoring/config'
import { buildHistogram, type PredictionInput } from '../../../server/utils/scoring/engine'

interface RawCase {
  fn: string
  args: unknown[]
}

const NO_BONUS: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'NONE' }
const CROWD_EXACT: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'CROWD', crowdMatchBasis: 'EXACT', crowdMinDenominator: 1 }
const CROWD_OUTCOME: ScoringRules = { ...CROWD_EXACT, crowdMatchBasis: 'OUTCOME' }
const ODDS: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'ODDS' }
const ODDS_EXACT: ScoringRules = { ...ODDS, oddsAppliesTo: 'EXACT' }
// The joker scales the base points only, and by a fractional multiplier - the
// total then needs rounding, which is where two stacks can drift.
const JOKER_BASE_ONLY: ScoringRules = { ...CROWD_EXACT, jokerAppliesToBonus: false, jokerMultiplier: 1.5 }
const CROWD_NO_OUTCOME_TIERS: ScoringRules = { ...CROWD_EXACT, crowdOutcomeTiers: null }
const CROWD_EMPTY_OUTCOME_TIERS: ScoringRules = { ...CROWD_EXACT, crowdOutcomeTiers: [] }

function preds(...rows: [string, number, number, boolean?][]): PredictionInput[] {
  return rows.map(([id, home, away, isJoker = false]) => ({ id, home, away, isJoker }))
}

export async function buildCases(): Promise<RawCase[]> {
  const crowd = preds(['p1', 2, 1], ['p2', 1, 0], ['p3', 3, 1], ['p4', 4, 2], ['p5', 3, 0], ['miss', 0, 0])
  const actual = { home: 2, away: 1 }
  const hist = buildHistogram(actual, crowd)

  return [
    // base tiers, no bonus (EXACT/DIFF/OUTCOME/MISS)
    { fn: 'scorePredictions', args: [{ actual, rules: NO_BONUS, predictions: preds(['exact', 2, 1], ['diff', 3, 2], ['outcome', 4, 1], ['miss', 0, 0]) }] },
    // empty field
    { fn: 'scorePredictions', args: [{ actual: { home: 0, away: 0 }, rules: NO_BONUS, predictions: [] }] },
    // crowd rarity, EXACT basis
    { fn: 'scorePredictions', args: [{ actual, rules: CROWD_EXACT, predictions: crowd }] },
    // crowd rarity, OUTCOME basis (rare correct result)
    { fn: 'scorePredictions', args: [{ actual: { home: 1, away: 0 }, rules: CROWD_OUTCOME, predictions: preds(['win', 1, 0], ['l1', 0, 1], ['l2', 0, 1], ['l3', 0, 2], ['l4', 0, 1]) }] },
    // odds bonus
    { fn: 'scorePredictions', args: [{ actual, rules: ODDS, predictions: preds(['a', 2, 1], ['b', 1, 0]), actualOutcomeOdds: 3.5 }] },
    // joker multiplier
    { fn: 'scorePredictions', args: [{ actual, rules: NO_BONUS, predictions: preds(['j', 2, 1, true]) }] },
    // forceJoker (single-match round)
    { fn: 'scorePredictions', args: [{ actual: { home: 0, away: 0 }, rules: NO_BONUS, predictions: preds(['x', 0, 0]), forceJoker: true }] },
    // direct primitives
    { fn: 'buildHistogram', args: [actual, crowd] },
    { fn: 'computeBonus', args: [{ home: 2, away: 1 }, actual, CROWD_EXACT, hist, null] },
    { fn: 'scoreSyntheticPrediction', args: [{ actual, rules: CROWD_EXACT, predictions: crowd }, { id: 'bot', home: 2, away: 1, isJoker: false }] },
    // joker scales the base only, by a fractional multiplier (rounding path)
    { fn: 'scorePredictions', args: [{ actual, rules: JOKER_BASE_ONLY, predictions: preds(['j', 2, 1, true], ['d', 3, 2, true], ['m', 0, 3, true], ['plain', 2, 1]) }] },
    // odds bonus paid on the EXACT score rather than the outcome
    { fn: 'scorePredictions', args: [{ actual, rules: ODDS_EXACT, predictions: preds(['exact', 2, 1], ['outcome', 3, 1]), actualOutcomeOdds: 6.5 }] },
    // no odds passed at all, and an empty odds-tier list
    { fn: 'scorePredictions', args: [{ actual, rules: ODDS, predictions: preds(['a', 2, 1]) }] },
    { fn: 'scorePredictions', args: [{ actual, rules: { ...ODDS, oddsTiers: [] }, predictions: preds(['a', 2, 1]), actualOutcomeOdds: 9 }] },
    // the result-rarity layer switched off, both ways
    { fn: 'scorePredictions', args: [{ actual, rules: CROWD_NO_OUTCOME_TIERS, predictions: crowd }] },
    { fn: 'scorePredictions', args: [{ actual, rules: CROWD_EMPTY_OUTCOME_TIERS, predictions: crowd }] },
    { fn: 'computeBonus', args: [{ home: 2, away: 1 }, actual, CROWD_NO_OUTCOME_TIERS, hist, null] },
  ]
}
