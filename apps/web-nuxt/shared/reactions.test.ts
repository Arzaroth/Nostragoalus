import { describe, it, expect } from 'vitest'
import { emptyReactionTotals, isReactionEmoji, REACTION_EMOJIS, REACTION_GLYPHS } from './reactions'

describe('reactions palette', () => {
  it('has a glyph for every emoji key', () => {
    for (const e of REACTION_EMOJIS) expect(REACTION_GLYPHS[e]).toBeTruthy()
  })

  it('emptyReactionTotals is a full record of zeros', () => {
    const totals = emptyReactionTotals()
    expect(Object.keys(totals).sort()).toEqual([...REACTION_EMOJIS].sort())
    expect(Object.values(totals).every((v) => v === 0)).toBe(true)
  })

  it('isReactionEmoji accepts known keys and rejects everything else', () => {
    expect(isReactionEmoji('FIRE')).toBe(true)
    expect(isReactionEmoji('NOPE')).toBe(false)
    expect(isReactionEmoji(null)).toBe(false)
    expect(isReactionEmoji(42)).toBe(false)
  })
})
