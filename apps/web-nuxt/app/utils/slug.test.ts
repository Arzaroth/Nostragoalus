import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with single dashes', () => {
    expect(slugify('Les Copains')).toBe('les-copains')
  })

  it('folds diacritics rather than dropping the letters', () => {
    expect(slugify('Équipe Café')).toBe('equipe-cafe')
  })

  it('collapses runs of punctuation and trims the ends', () => {
    expect(slugify('  Ligue 1!! -- best  ')).toBe('ligue-1-best')
  })

  it('yields an empty string when nothing survives', () => {
    expect(slugify('')).toBe('')
    expect(slugify('!!!')).toBe('')
    expect(slugify('دوري')).toBe('')
  })
})
