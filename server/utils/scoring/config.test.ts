import { describe, it, expect } from 'vitest'
import { DEFAULT_RULES, rulesFromConfigRow, type ScoringConfigRow } from './config'

describe('DEFAULT_RULES', () => {
  it('uses the agreed base points and crowd defaults', () => {
    expect(DEFAULT_RULES.base).toEqual({ exact: 3, diff: 2, outcome: 1, miss: 0 })
    expect(DEFAULT_RULES.bonusSource).toBe('CROWD')
    expect(DEFAULT_RULES.crowdMinDenominator).toBe(5)
    expect(DEFAULT_RULES.jokerMultiplier).toBe(2)
    expect(DEFAULT_RULES.jokerAppliesToBonus).toBe(true)
    expect(DEFAULT_RULES.championBonus).toBe(10)
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
    expect(rules.crowdMatchBasis).toBe('OUTCOME')
    expect(rules.crowdMinDenominator).toBe(10)
    expect(rules.oddsTiers).toEqual([{ minDecimalOdds: 3, bonus: 2 }])
  })

  it('keeps an explicit oddsAppliesTo value', () => {
    expect(rulesFromConfigRow({ ...baseRow, oddsAppliesTo: 'EXACT' }).oddsAppliesTo).toBe('EXACT')
  })
})
