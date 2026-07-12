import { describe, it, expect } from 'vitest'
import { EMOJI_CATEGORIES, ALL_EMOJI, searchEmoji } from './emoji-data'

describe('emoji dataset', () => {
  it('has several categories, each with items', () => {
    expect(EMOJI_CATEGORIES.length).toBeGreaterThan(5)
    for (const c of EMOJI_CATEGORIES) {
      expect(c.key).toBeTruthy()
      expect(c.items.length).toBeGreaterThan(0)
    }
  })

  it('flattens every category item into ALL_EMOJI', () => {
    const total = EMOJI_CATEGORIES.reduce((n, c) => n + c.items.length, 0)
    expect(ALL_EMOJI.length).toBe(total)
  })

  it('every item has a glyph and keywords, with no replacement chars', () => {
    for (const it of ALL_EMOJI) {
      expect(it.e.length).toBeGreaterThan(0)
      expect(it.e).not.toContain('�')
      expect(it.k.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('searchEmoji', () => {
  it('returns the full list for an empty or whitespace query', () => {
    expect(searchEmoji('')).toBe(ALL_EMOJI)
    expect(searchEmoji('   ')).toBe(ALL_EMOJI)
  })

  it('matches keywords case-insensitively', () => {
    const hits = searchEmoji('Heart')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((it) => it.k.includes('heart'))).toBe(true)
  })

  it('finds a soccer ball by keyword', () => {
    expect(searchEmoji('soccer').map((it) => it.e)).toContain('⚽')
  })

  it('returns nothing for an unmatched query', () => {
    expect(searchEmoji('zzzznotanemoji')).toEqual([])
  })
})
