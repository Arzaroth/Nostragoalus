import { describe, it, expect } from 'vitest'
import { scorePredictions, scoreSyntheticPrediction, type PredictionInput } from './engine'
import { DEFAULT_RULES, type ScoringRules } from './config'

const NO_BONUS: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'NONE' }

function preds(...rows: [string, number, number, boolean?][]): PredictionInput[] {
  return rows.map(([id, home, away, isJoker = false]) => ({ id, home, away, isJoker }))
}

function byId(scores: ReturnType<typeof scorePredictions>) {
  return Object.fromEntries(scores.map((s) => [s.id, s]))
}

describe('scorePredictions - base tiers (no bonus)', () => {
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

describe('scorePredictions - crowd rarity bonus', () => {
  const rules: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'CROWD', crowdMatchBasis: 'EXACT', crowdMinDenominator: 1 }

  it('rewards a rare exact score and leaves non-exact picks bonus-free', () => {
    const scores = byId(
      scorePredictions({
        actual: { home: 2, away: 1 },
        // Five got the home win, only p1 nailed the exact score.
        rules,
        predictions: preds(['p1', 2, 1], ['p2', 1, 0], ['p3', 3, 1], ['p4', 4, 2], ['p5', 3, 0], ['miss', 0, 0]),
      }),
    )
    // exactCount=1 among outcomeCount=5 correct-result picks => share 0.2 < 0.22 => bonus 2
    expect(scores.p1).toMatchObject({ baseTier: 'EXACT', basePoints: 3, bonusPoints: 2, bonusSource: 'CROWD', crowdShare: 0.2, totalPoints: 5 })
    expect(scores.p2).toMatchObject({ baseTier: 'DIFF', bonusPoints: 0, crowdShare: null, totalPoints: 2 })
    expect(scores.miss).toMatchObject({ baseTier: 'MISS', totalPoints: 0 })
  })

  it('supports an OUTCOME crowd basis', () => {
    const outcomeRules: ScoringRules = { ...rules, crowdMatchBasis: 'OUTCOME' }
    const rows: [string, number, number][] = [['win', 1, 0]]
    for (let i = 0; i < 9; i += 1) rows.push([`loss${i}`, 0, 1])
    const scores = byId(
      scorePredictions({ actual: { home: 1, away: 0 }, rules: outcomeRules, predictions: preds(...rows) }),
    )
    // outcomeCount=1, total=10 => share 0.1 < 0.12 => bonus 3 (outcome rarity = whole field)
    expect(scores.win).toMatchObject({ bonusPoints: 3, bonusSource: 'CROWD', crowdShare: 0.1, totalPoints: 6 })
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

describe('scorePredictions - result-rarity layer (crowdOutcomeTiers)', () => {
  const rules: ScoringRules = {
    ...DEFAULT_RULES,
    bonusSource: 'CROWD',
    crowdMatchBasis: 'EXACT',
    crowdMinDenominator: 1,
    crowdTiers: [{ maxShareExclusive: 0.35, bonus: 1 }],
    crowdOutcomeTiers: [
      { maxShareExclusive: 0.1, bonus: 2 },
      { maxShareExclusive: 0.25, bonus: 1 },
    ],
  }

  it('stacks a result-rarity bonus on top of exact-score rarity', () => {
    // 20 predictions; only three called the home win, one of them exact 2-1.
    const rows: [string, number, number][] = [
      ['exact', 2, 1],
      ['win-a', 3, 1],
      ['win-b', 4, 2],
    ]
    for (let i = 0; i < 17; i += 1) rows.push([`loss${i}`, 0, 1])
    const scores = byId(scorePredictions({ actual: { home: 2, away: 1 }, rules, predictions: preds(...rows) }))
    // exact share 1/3 < 0.35 => +1 exact; result share 3/20 = 0.15 < 0.25 => +1 result
    expect(scores.exact).toMatchObject({ baseTier: 'EXACT', basePoints: 3, bonusPoints: 2, totalPoints: 5 })
    expect(scores.exact.crowdShare).toBeCloseTo(1 / 3)
    // Correct result, not exact: no exact bonus, still earns the +1 result rarity.
    expect(scores['win-a']).toMatchObject({ baseTier: 'OUTCOME', basePoints: 1, bonusPoints: 1, crowdShare: null, totalPoints: 2 })
    expect(scores.loss0).toMatchObject({ baseTier: 'MISS', bonusPoints: 0, totalPoints: 0 })
  })

  it('does not apply the result layer in OUTCOME basis (the primary already rewards it)', () => {
    const outcomeRules: ScoringRules = { ...rules, crowdMatchBasis: 'OUTCOME' }
    const rows: [string, number, number][] = [['win', 2, 1]]
    for (let i = 0; i < 9; i += 1) rows.push([`loss${i}`, 0, 1])
    const scores = byId(scorePredictions({ actual: { home: 2, away: 1 }, rules: outcomeRules, predictions: preds(...rows) }))
    // outcome share 1/10 = 0.1 < 0.35 => primary +1 only, no stacked layer
    expect(scores.win).toMatchObject({ bonusPoints: 1, totalPoints: 4 })
  })

  it('treats a null result layer as off (legacy behaviour)', () => {
    const noLayer: ScoringRules = { ...rules, crowdOutcomeTiers: null }
    const rows: [string, number, number][] = [['exact', 2, 1], ['win-a', 3, 1], ['win-b', 4, 2]]
    for (let i = 0; i < 17; i += 1) rows.push([`loss${i}`, 0, 1])
    const scores = byId(scorePredictions({ actual: { home: 2, away: 1 }, rules: noLayer, predictions: preds(...rows) }))
    expect(scores.exact).toMatchObject({ bonusPoints: 1, totalPoints: 4 })
    expect(scores['win-a']).toMatchObject({ bonusPoints: 0, totalPoints: 1 })
  })
})

describe('scorePredictions - odds bonus', () => {
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

describe('scorePredictions - joker', () => {
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

describe('scoreSyntheticPrediction', () => {
  const rules: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'CROWD', crowdMatchBasis: 'EXACT', crowdMinDenominator: 1 }

  it('keeps the synthetic pick out of its own crowd denominator', () => {
    const crowd = preds(['p1', 2, 1], ['p2', 1, 0], ['p3', 3, 1], ['p4', 0, 0])
    const input = { actual: { home: 2, away: 1 }, rules, predictions: crowd }
    const synthetic = scoreSyntheticPrediction(input, { id: 'bot', home: 2, away: 1, isJoker: false })
    const real = byId(scorePredictions(input))
    // Same share as p1 (1/4): the bot pick did not bump exactCount or total.
    expect(synthetic.crowdShare).toBe(real.p1.crowdShare)
    expect(synthetic).toMatchObject({ baseTier: 'EXACT', basePoints: 3, bonusPoints: 1, totalPoints: 4 })
  })

  it('leaves the real scores untouched compared to a crowd that contains the pick', () => {
    const crowd = preds(['p1', 2, 1], ['p2', 1, 0])
    const polluted = preds(['p1', 2, 1], ['p2', 1, 0], ['bot', 2, 1])
    const clean = scoreSyntheticPrediction({ actual: { home: 2, away: 1 }, rules, predictions: crowd }, { id: 'bot', home: 2, away: 1, isJoker: false })
    const inCrowd = byId(scorePredictions({ actual: { home: 2, away: 1 }, rules, predictions: polluted }))
    // 1/2 vs 2/3: joining the crowd would have changed the share.
    expect(clean.crowdShare).toBe(0.5)
    expect(inCrowd.bot.crowdShare).toBeCloseTo(2 / 3)
  })

  it('applies the joker multiplier and forceJoker', () => {
    const noBonus = { actual: { home: 1, away: 0 }, rules: NO_BONUS, predictions: preds(['p1', 0, 1]) }
    expect(scoreSyntheticPrediction(noBonus, { id: 'bot', home: 1, away: 0, isJoker: true }).totalPoints).toBe(6)
    expect(
      scoreSyntheticPrediction({ ...noBonus, forceJoker: true }, { id: 'bot', home: 1, away: 0, isJoker: false }).totalPoints,
    ).toBe(6)
  })

  it('scores against an empty crowd without a bonus', () => {
    const score = scoreSyntheticPrediction(
      { actual: { home: 1, away: 0 }, rules, predictions: [] },
      { id: 'bot', home: 1, away: 0, isJoker: false },
    )
    expect(score).toMatchObject({ baseTier: 'EXACT', bonusPoints: 0, crowdShare: null, totalPoints: 3 })
  })
})

it('forceJoker doubles everyone on the final, joker or not', async () => {
  const { scorePredictions } = await import('./engine')
  const rules = { ptsExact: 3, ptsDiff: 2, ptsOutcome: 1, ptsMiss: 0, jokerMultiplier: 2, jokerAppliesToBonus: true, bonusSource: 'NONE' as const, crowdTiers: [], crowdMinDenominator: 5, oddsTiers: null }
  const scores = scorePredictions({
    actual: { home: 2, away: 1 },
    rules,
    forceJoker: true,
    predictions: [
      { id: 'a', home: 2, away: 1, isJoker: false },
      { id: 'b', home: 1, away: 0, isJoker: false },
    ],
  })
  expect(scores.find((s) => s.id === 'a')!.totalPoints).toBe(6) // exact x2
  expect(scores.find((s) => s.id === 'b')!.totalPoints).toBe(4) // gd x2
  expect(scores[0].jokerMultiplier).toBe(2)
})
