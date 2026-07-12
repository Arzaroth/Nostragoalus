import { describe, it, expect } from 'vitest'
import {
  basePointsFor,
  classifyTier,
  DEFAULT_BASE_POINTS,
  goalDifference,
  outcomeOf,
  type BaseTier,
} from './tiers'

describe('outcomeOf', () => {
  it('detects a home win', () => {
    expect(outcomeOf({ home: 2, away: 0 })).toBe('HOME')
  })
  it('detects an away win', () => {
    expect(outcomeOf({ home: 0, away: 1 })).toBe('AWAY')
  })
  it('detects a draw', () => {
    expect(outcomeOf({ home: 1, away: 1 })).toBe('DRAW')
  })
})

describe('goalDifference', () => {
  it('is positive for home advantage', () => {
    expect(goalDifference({ home: 3, away: 1 })).toBe(2)
  })
  it('is negative for away advantage', () => {
    expect(goalDifference({ home: 0, away: 2 })).toBe(-2)
  })
  it('is zero for a draw', () => {
    expect(goalDifference({ home: 2, away: 2 })).toBe(0)
  })
})

describe('classifyTier', () => {
  it('returns EXACT when both goal counts match', () => {
    expect(classifyTier({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe('EXACT')
  })

  it('returns DIFF for the correct winner and goal difference', () => {
    expect(classifyTier({ home: 2, away: 1 }, { home: 3, away: 2 })).toBe('DIFF')
  })

  it('returns DIFF for a draw with the same (zero) goal difference', () => {
    expect(classifyTier({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe('DIFF')
  })

  it('returns OUTCOME for the correct winner but wrong goal difference', () => {
    expect(classifyTier({ home: 2, away: 0 }, { home: 3, away: 2 })).toBe('OUTCOME')
  })

  it('returns MISS for the wrong outcome', () => {
    expect(classifyTier({ home: 2, away: 1 }, { home: 0, away: 1 })).toBe('MISS')
  })

  it('treats an exact draw as EXACT, not DIFF', () => {
    expect(classifyTier({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe('EXACT')
  })
})

describe('basePointsFor', () => {
  it('maps each tier to its default points', () => {
    const expected: Record<BaseTier, number> = { EXACT: 3, DIFF: 2, OUTCOME: 1, MISS: 0 }
    for (const tier of Object.keys(expected) as BaseTier[]) {
      expect(basePointsFor(tier)).toBe(expected[tier])
    }
  })

  it('uses the default points table when none is provided', () => {
    expect(basePointsFor('EXACT')).toBe(DEFAULT_BASE_POINTS.exact)
  })

  it('honours a custom points table', () => {
    const custom = { exact: 10, diff: 5, outcome: 2, miss: -1 }
    expect(basePointsFor('EXACT', custom)).toBe(10)
    expect(basePointsFor('DIFF', custom)).toBe(5)
    expect(basePointsFor('OUTCOME', custom)).toBe(2)
    expect(basePointsFor('MISS', custom)).toBe(-1)
  })
})
