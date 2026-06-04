import { describe, it, expect } from 'vitest'
import { scorePredictions, type PredictionInput } from './engine'
import { DEFAULT_RULES, type ScoringRules } from './config'

const NO_BONUS: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'NONE' }

function preds(...rows: [string, number, number, boolean?][]): PredictionInput[] {
  return rows.map(([id, home, away, isJoker = false]) => ({ id, home, away, isJoker }))
}

function byId(scores: ReturnType<typeof scorePredictions>) {
  return Object.fromEntries(scores.map((s) => [s.id, s]))
}

describe('scorePredictions — base tiers (no bonus)', () => {
  it('scores each prediction by closeness', () => {
    const scores = byId(
      scorePredictions({
        actual: { home: 2, away: 1 },
        rules: NO_BONUS,
        predictions: preds(
          ['exact', 2, 1],
          ['diff', 3, 2],
          ['outcome', 4, 1],
          ['miss', 0, 0],
        ),
      }),
    )
    expect(scores.exact).toMatchObject({ baseTier: 'EXACT', basePoints: 3, totalPoints: 3, bonusSource: 'NONE' })
    expect(scores.diff).toMatchObject({ baseTier: 'DIFF', basePoints: 2, totalPoints: 2 })
    expect(scores.outcome).toMatchObject({ baseTier: 'OUTCOME', basePoints: 1, totalPoints: 1 })
    expect(scores.miss).toMatchObject({ baseTier: 'MISS', basePoints: 0, totalPoints: 0 })
  })

  it('returns an empty array for no predictions', () => {
    expect(scorePredictions({ actual: { home: 0, away: 0 }, rules: NO_BONUS, predictions: [] })).toEqual([])
  })
})

describe('scorePredictions — crowd rarity bonus', () => {
  const rules: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'CROWD', crowdMatchBasis: 'EXACT', crowdMinDenominator: 1 }

  it('rewards a rare exact score and leaves non-exact picks bonus-free', () => {
    const scores = byId(
      scorePredictions({
        actual: { home: 2, away: 1 },
        rules,
        predictions: preds(['p1', 2, 1], ['p2', 1, 0], ['p3', 3, 1], ['p4', 0, 0]),
      }),
    )
    // exactCount=1, total=4 => share 0.25 < 0.4 => bonus 1
    expect(scores.p1).toMatchObject({ baseTier: 'EXACT', basePoints: 3, bonusPoints: 1, bonusSource: 'CROWD', crowdShare: 0.25, totalPoints: 4 })
    expect(scores.p2).toMatchObject({ baseTier: 'DIFF', bonusPoints: 0, crowdShare: null, totalPoints: 2 })
    expect(scores.p4).toMatchObject({ baseTier: 'MISS', totalPoints: 0 })
  })

  it('supports an OUTCOME crowd basis', () => {
    const outcomeRules: ScoringRules = { ...rules, crowdMatchBasis: 'OUTCOME' }
    const rows: [string, number, number][] = [['win', 1, 0]]
    for (let i = 0; i < 9; i += 1) rows.push([`loss${i}`, 0, 1])
    const scores = byId(
      scorePredictions({ actual: { home: 1, away: 0 }, rules: outcomeRules, predictions: preds(...rows) }),
    )
    // outcomeCount=1, total=10 => share 0.1 < 0.15 => bonus 2
    expect(scores.win).toMatchObject({ bonusPoints: 2, bonusSource: 'CROWD', crowdShare: 0.1, totalPoints: 5 })
    expect(scores.loss0).toMatchObject({ bonusPoints: 0, crowdShare: null })
  })

  it('suppresses the bonus when there are too few predictions', () => {
    const strict: ScoringRules = { ...rules, crowdMinDenominator: 5 }
    const scores = byId(
      scorePredictions({ actual: { home: 1, away: 0 }, rules: strict, predictions: preds(['p1', 1, 0], ['p2', 0, 1]) }),
    )
    expect(scores.p1).toMatchObject({ basePoints: 3, bonusPoints: 0, crowdShare: null })
  })
})

describe('scorePredictions — odds bonus', () => {
  it('rewards a correct outcome by the actual outcome odds', () => {
    const rules: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'ODDS', oddsAppliesTo: 'OUTCOME' }
    const scores = byId(
      scorePredictions({
        actual: { home: 1, away: 0 },
        actualOutcomeOdds: 4,
        rules,
        predictions: preds(['win', 3, 0], ['loss', 0, 1]),
      }),
    )
    expect(scores.win).toMatchObject({ baseTier: 'OUTCOME', basePoints: 1, bonusPoints: 3, bonusSource: 'ODDS', totalPoints: 4 })
    expect(scores.loss).toMatchObject({ bonusPoints: 0 })
  })

  it('supports an EXACT odds basis', () => {
    const rules: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'ODDS', oddsAppliesTo: 'EXACT' }
    const scores = byId(
      scorePredictions({
        actual: { home: 1, away: 0 },
        actualOutcomeOdds: 7,
        rules,
        predictions: preds(['exact', 1, 0], ['outcome', 2, 0]),
      }),
    )
    expect(scores.exact).toMatchObject({ bonusPoints: 5, totalPoints: 8 })
    expect(scores.outcome).toMatchObject({ bonusPoints: 0 })
  })
})

describe('scorePredictions — joker', () => {
  const oddsRules: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'ODDS', oddsAppliesTo: 'OUTCOME' }

  it('doubles base + bonus by default', () => {
    const [score] = scorePredictions({
      actual: { home: 1, away: 0 },
      actualOutcomeOdds: 4,
      rules: { ...oddsRules, jokerAppliesToBonus: true },
      predictions: preds(['j', 1, 0, true]),
    })
    // base 3 (exact) + bonus 3, doubled => 12
    expect(score).toMatchObject({ jokerMultiplier: 2, totalPoints: 12 })
  })

  it('doubles base only when configured', () => {
    const [score] = scorePredictions({
      actual: { home: 1, away: 0 },
      actualOutcomeOdds: 4,
      rules: { ...oddsRules, jokerAppliesToBonus: false },
      predictions: preds(['j', 1, 0, true]),
    })
    // base 3 * 2 + bonus 3 => 9
    expect(score).toMatchObject({ totalPoints: 9 })
  })

  it('rounds fractional multipliers', () => {
    const [score] = scorePredictions({
      actual: { home: 1, away: 0 },
      rules: { ...NO_BONUS, jokerMultiplier: 1.5 },
      predictions: preds(['j', 1, 0, true]),
    })
    // base 3 * 1.5 = 4.5 => 5
    expect(score.totalPoints).toBe(5)
  })
})
