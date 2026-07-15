import { describe, expect, it } from 'vitest'
import { flagUrl, roundLabelKey, shareScore, TIER_COLOR } from './share-card'

describe('roundLabelKey', () => {
  it('maps each known knockout round to its bracket key, group/raw labels to null', () => {
    expect(roundLabelKey('Round of 32')).toBe('bracket.round.r32')
    expect(roundLabelKey('Last 16')).toBe('bracket.round.r16')
    expect(roundLabelKey('Quarter-finals')).toBe('bracket.round.qf')
    expect(roundLabelKey('Semi-finals')).toBe('bracket.round.sf')
    expect(roundLabelKey('Third place play-off')).toBe('bracket.round.third')
    expect(roundLabelKey('Final')).toBe('bracket.round.final')
    expect(roundLabelKey('Group Stage')).toBeNull()
    expect(roundLabelKey(null)).toBeNull()
    expect(roundLabelKey(undefined)).toBeNull()
  })

  it('reads the third-place variants that contain "final" as third, not final', () => {
    expect(roundLabelKey('Bronze final')).toBe('bracket.round.third')
    expect(roundLabelKey('3rd place final')).toBe('bracket.round.third')
    expect(roundLabelKey('Bronze medal match')).toBe('bracket.round.third')
  })
})

describe('shareScore', () => {
  it('formats a scoreline, rendering nullish sides as 0', () => {
    expect(shareScore(3, 1)).toBe('3 - 1')
    expect(shareScore(0, 0)).toBe('0 - 0')
    expect(shareScore(null, 2)).toBe('0 - 2')
    expect(shareScore(undefined, undefined)).toBe('0 - 0')
  })
})

describe('flagUrl', () => {
  it('builds the FIFA flag URL from a tricode, null without one', () => {
    expect(flagUrl('MEX')).toBe('https://api.fifa.com/api/v3/picture/flags-sq-3/MEX')
    expect(flagUrl(null)).toBeNull()
    expect(flagUrl(undefined)).toBeNull()
  })
})

describe('TIER_COLOR', () => {
  it('has a color for every scoring tier', () => {
    expect(Object.keys(TIER_COLOR).sort()).toEqual(['DIFF', 'EXACT', 'MISS', 'OUTCOME'])
  })
})
