import { describe, expect, it } from 'vitest'
import { shareTranslator } from '../server/utils/share/i18n'

describe('shareTranslator', () => {
  it('translates a known key in the requested locale', () => {
    expect(shareTranslator('fr')('share.card.myCall')).toBe('Mon pronostic')
  })

  it('interpolates named params', () => {
    expect(shareTranslator('en')('share.card.rarity', { pct: 4 })).toBe('Only 4% of players called this scoreline')
  })

  it('leaves the {placeholder} literal when a referenced param is missing', () => {
    expect(shareTranslator('en')('share.card.rarity', {})).toBe('Only {pct}% of players called this scoreline')
  })

  it('falls back to the English dict for an unknown locale', () => {
    // Cast: drives the `DICTS[locale] ?? DICTS.en` fallback with a locale absent
    // from the dict map (verifies the runtime guard, not the type).
    expect(shareTranslator('de' as 'en')('share.card.myCall')).toBe('My call')
  })

  it('returns the raw key when it is absent everywhere (both fallbacks miss)', () => {
    expect(shareTranslator('en')('share.card.doesNotExist')).toBe('share.card.doesNotExist')
    // A path that runs through a non-object segment must also yield the raw key,
    // not throw (drives the typeof-object guard in lookup).
    expect(shareTranslator('th')('share.card.myCall.nope')).toBe('share.card.myCall.nope')
  })
})
