import { describe, expect, it } from 'vitest'
import { rosterDelta, shouldOffer } from './voice'

describe('shouldOffer', () => {
  it('the smaller id offers, the larger waits', () => {
    expect(shouldOffer('a', 'b')).toBe(true)
    expect(shouldOffer('b', 'a')).toBe(false)
  })
  it('exactly one side of a pair offers', () => {
    expect(shouldOffer('a', 'b')).not.toBe(shouldOffer('b', 'a'))
  })
})

describe('rosterDelta', () => {
  it('adds new peers and excludes self', () => {
    expect(rosterDelta([], ['me', 'a', 'b'], 'me')).toEqual({ added: ['a', 'b'], removed: [] })
  })
  it('removes peers that left', () => {
    expect(rosterDelta(['a', 'b'], ['me', 'a'], 'me')).toEqual({ added: [], removed: ['b'] })
  })
  it('handles a simultaneous join and leave', () => {
    const d = rosterDelta(['a'], ['me', 'b'], 'me')
    expect(d.added).toEqual(['b'])
    expect(d.removed).toEqual(['a'])
  })
  it('is a no-op when the peer set is unchanged', () => {
    expect(rosterDelta(['a', 'b'], ['me', 'a', 'b'], 'me')).toEqual({ added: [], removed: [] })
  })
})
