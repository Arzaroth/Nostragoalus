import { describe, it, expect } from 'vitest'
import { getCachedBracket, setCachedBracket, invalidateBracketCache } from './cache'
import type { NormalizedBracket } from '../../../shared/types/match'

const sample: NormalizedBracket = { winner: null, rounds: [] }

describe('bracket cache', () => {
  it('returns undefined on a miss, the value within the TTL, and undefined once expired', () => {
    const cid = 'comp-fresh'
    expect(getCachedBracket(cid, 0)).toBeUndefined()
    setCachedBracket(cid, 1_000, sample)
    expect(getCachedBracket(cid, 1_000)).toBe(sample)
    expect(getCachedBracket(cid, 1_000 + 9 * 60_000)).toBe(sample) // inside 10 min
    expect(getCachedBracket(cid, 1_000 + 11 * 60_000)).toBeUndefined() // past 10 min
  })

  it('distinguishes a cached null ("no bracket") from a miss', () => {
    const cid = 'comp-null'
    setCachedBracket(cid, 0, null)
    expect(getCachedBracket(cid, 0)).toBeNull()
  })

  it('invalidate drops the entry so the next read is a miss', () => {
    const cid = 'comp-bust'
    setCachedBracket(cid, 0, sample)
    expect(getCachedBracket(cid, 0)).toBe(sample)
    invalidateBracketCache(cid)
    expect(getCachedBracket(cid, 0)).toBeUndefined()
  })
})
