import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CHAMPION_TIERS,
  DEFAULT_RULES,
  championPointsForRank,
  rulesFromConfigRow,
  type ScoringConfigRow,
} from './config'

describe('DEFAULT_RULES', () => {
  it('uses the agreed base points and crowd defaults', () => {
    expect(DEFAULT_RULES.base).toEqual({ exact: 3, diff: 2, outcome: 1, miss: 0 })
    expect(DEFAULT_RULES.bonusSource).toBe('CROWD')
    expect(DEFAULT_RULES.crowdMinDenominator).toBe(5)
    expect(DEFAULT_RULES.jokerMultiplier).toBe(2)
    expect(DEFAULT_RULES.jokerAppliesToBonus).toBe(true)
    expect(DEFAULT_RULES.championBonus).toBe(10)
    expect(DEFAULT_RULES.bestScorerBonus).toBe(10)
    expect(DEFAULT_RULES.championTiers).toEqual([
      { maxRank: 8, points: 10 },
      { maxRank: 20, points: 15 },
      { maxRank: 40, points: 25 },
      { maxRank: null, points: 40 },
    ])
  })
})

describe('championPointsForRank', () => {
  it('maps ranks onto the tier buckets, boundaries included', () => {
    expect(championPointsForRank(1, DEFAULT_RULES)).toBe(10)
    expect(championPointsForRank(8, DEFAULT_RULES)).toBe(10)
    expect(championPointsForRank(9, DEFAULT_RULES)).toBe(15)
    expect(championPointsForRank(20, DEFAULT_RULES)).toBe(15)
    expect(championPointsForRank(21, DEFAULT_RULES)).toBe(25)
    expect(championPointsForRank(40, DEFAULT_RULES)).toBe(25)
    expect(championPointsForRank(41, DEFAULT_RULES)).toBe(40)
    expect(championPointsForRank(150, DEFAULT_RULES)).toBe(40)
  })

  it('treats an unknown rank (team not in the FIFA table) as the catch-all long shot', () => {
    expect(championPointsForRank(null, DEFAULT_RULES)).toBe(40)
    expect(championPointsForRank(undefined, DEFAULT_RULES)).toBe(40)
  })

  it('falls back to the flat bonus only when no tier covers the rank (no catch-all)', () => {
    const rules = { ...DEFAULT_RULES, championBonus: 9, championTiers: [{ maxRank: 8, points: 12 }] }
    expect(championPointsForRank(5, rules)).toBe(12)
    expect(championPointsForRank(50, rules)).toBe(9)
    expect(championPointsForRank(null, rules)).toBe(9)
  })

  it('resolves correctly even when tiers are stored out of order', () => {
    const rules = { ...DEFAULT_RULES, championTiers: [{ maxRank: null, points: 40 }, { maxRank: 8, points: 10 }, { maxRank: 20, points: 15 }] }
    expect(championPointsForRank(5, rules)).toBe(10)
    expect(championPointsForRank(15, rules)).toBe(15)
    expect(championPointsForRank(99, rules)).toBe(40)
  })
})

describe('rulesFromConfigRow', () => {
  const baseRow: ScoringConfigRow = {
    ptsExact: 4,
    ptsDiff: 2,
    ptsOutcome: 1,
    ptsMiss: 0,
    jokerMultiplier: '2.00',
    jokerAppliesToBonus: false,
    championBonus: 7,
    championTiers: null,
    bestScorerBonus: 8,
    bonusSource: 'ODDS',
    crowdTiers: [{ maxShareExclusive: 0.1, bonus: 2 }],
    crowdMatchBasis: 'OUTCOME',
    crowdMinDenominator: 10,
    oddsTiers: [{ minDecimalOdds: 3, bonus: 2 }],
    oddsAppliesTo: null,
  }

  it('parses a numeric-string joker multiplier into a number', () => {
    expect(rulesFromConfigRow(baseRow).jokerMultiplier).toBe(2)
  })

  it('defaults oddsAppliesTo to OUTCOME when null', () => {
    expect(rulesFromConfigRow(baseRow).oddsAppliesTo).toBe('OUTCOME')
  })

  it('maps the base points and passes through the rest', () => {
    const rules = rulesFromConfigRow(baseRow)
    expect(rules.base).toEqual({ exact: 4, diff: 2, outcome: 1, miss: 0 })
    expect(rules.bonusSource).toBe('ODDS')
    expect(rules.jokerAppliesToBonus).toBe(false)
    expect(rules.championBonus).toBe(7)
    expect(rules.bestScorerBonus).toBe(8)
    expect(rules.crowdMatchBasis).toBe('OUTCOME')
    expect(rules.crowdMinDenominator).toBe(10)
    expect(rules.oddsTiers).toEqual([{ minDecimalOdds: 3, bonus: 2 }])
  })

  it('keeps an explicit oddsAppliesTo value', () => {
    expect(rulesFromConfigRow({ ...baseRow, oddsAppliesTo: 'EXACT' }).oddsAppliesTo).toBe('EXACT')
  })

  it('defaults championTiers when the row predates the column, keeps explicit ones', () => {
    expect(rulesFromConfigRow(baseRow).championTiers).toEqual(DEFAULT_CHAMPION_TIERS)
    const custom = [{ maxRank: 10, points: 11 }]
    expect(rulesFromConfigRow({ ...baseRow, championTiers: custom }).championTiers).toEqual(custom)
  })
})
