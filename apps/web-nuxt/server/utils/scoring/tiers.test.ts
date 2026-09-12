import { describe, it, expect } from 'vitest'
import {
  basePointsFor,
  classifyTier,
  DEFAULT_BASE_POINTS,
  goalDifference,
  marginBandOf,
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

describe('marginBandOf', () => {
  it('gives every margin its own band when there are none', () => {
    // This is what keeps football identical: band equality collapses back into
    // exact goal-difference equality.
    expect(marginBandOf(3, null)).toBe(3)
    expect(marginBandOf(-3, null)).toBe(3)
    expect(marginBandOf(0, null)).toBe(0)
    expect(marginBandOf(3, [])).toBe(3)
  })

  it('buckets a margin by the first bound it fits under', () => {
    const bands = [7, 14]
    expect(marginBandOf(1, bands)).toBe(0)
    expect(marginBandOf(7, bands)).toBe(0)
    expect(marginBandOf(8, bands)).toBe(1)
    expect(marginBandOf(14, bands)).toBe(1)
    expect(marginBandOf(15, bands)).toBe(2)
    expect(marginBandOf(60, bands)).toBe(2)
  })

  it('ignores which side is ahead', () => {
    expect(marginBandOf(-9, [7, 14])).toBe(marginBandOf(9, [7, 14]))
  })

  it('puts a draw in the first band', () => {
    expect(marginBandOf(0, [7, 14])).toBe(0)
  })
})

describe('classifyTier with margin bands', () => {
  const RUGBY = [7, 14]

  it('rewards a margin in the same band as DIFF', () => {
    // 31-24 is a 7-point win; 27-24 is a 3-point win. Different margins, same
    // band - one converted try - so it reads as the close call it was.
    expect(classifyTier({ home: 27, away: 24 }, { home: 31, away: 24 }, RUGBY)).toBe('DIFF')
  })

  it('drops a correct winner in the wrong band to OUTCOME', () => {
    expect(classifyTier({ home: 38, away: 24 }, { home: 31, away: 24 }, RUGBY)).toBe('OUTCOME')
  })

  it('still pays EXACT for the exact scoreline', () => {
    expect(classifyTier({ home: 31, away: 24 }, { home: 31, away: 24 }, RUGBY)).toBe('EXACT')
  })

  it('still calls the wrong winner a MISS', () => {
    expect(classifyTier({ home: 20, away: 30 }, { home: 31, away: 24 }, RUGBY)).toBe('MISS')
  })

  it('treats any drawn guess as the same band as any other draw', () => {
    expect(classifyTier({ home: 20, away: 20 }, { home: 17, away: 17 }, RUGBY)).toBe('DIFF')
  })

  it('is unchanged from exact-difference matching when no bands are given', () => {
    // The football path, asserted against the banded call explicitly so a future
    // default cannot quietly reband every existing competition.
    expect(classifyTier({ home: 3, away: 1 }, { home: 2, away: 0 })).toBe('DIFF')
    expect(classifyTier({ home: 4, away: 1 }, { home: 2, away: 0 })).toBe('OUTCOME')
    expect(classifyTier({ home: 4, away: 1 }, { home: 2, away: 0 }, RUGBY)).toBe('DIFF')
  })
})
