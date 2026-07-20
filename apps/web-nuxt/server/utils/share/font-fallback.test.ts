import { describe, expect, it } from 'vitest'
import { fallbackFamilies } from './font-fallback'

describe('fallbackFamilies', () => {
  it('maps a satori locale code to its Noto family', () => {
    expect(fallbackFamilies('ar-AR', 'مرحبا')).toEqual(['Noto Sans Arabic'])
    expect(fallbackFamilies('ja-JP', 'ひらがな')).toEqual(['Noto Sans JP'])
    expect(fallbackFamilies('devanagari', 'नमस्ते')).toEqual(['Noto Sans Devanagari'])
    expect(fallbackFamilies('emoji', '🔥')).toEqual(['Noto Emoji'])
  })

  it('tries both symbol families, since satori labels math operators "symbol"', () => {
    expect(fallbackFamilies('symbol', '∑')).toEqual(['Noto Sans Symbols 2', 'Noto Sans Math', 'Noto Sans'])
    expect(fallbackFamilies('math', '\u{1D4D1}')).toEqual(['Noto Sans Symbols 2', 'Noto Sans Math', 'Noto Sans'])
  })

  it('derives the family from the text for an unlabelled script', () => {
    expect(fallbackFamilies('unknown', 'ꓭ')).toEqual(['Noto Sans Lisu', 'Noto Sans'])
  })

  it('returns every script present, since one run can mix them', () => {
    expect(fallbackFamilies('unknown', 'ꓭᎦ')).toEqual(['Noto Sans Cherokee', 'Noto Sans Lisu', 'Noto Sans'])
  })

  it('leaves Latin, Cyrillic and Greek to plain Noto Sans', () => {
    expect(fallbackFamilies('unknown', 'Привет')).toEqual(['Noto Sans'])
    expect(fallbackFamilies('unknown', 'Ελληνικά')).toEqual(['Noto Sans'])
    expect(fallbackFamilies('unknown', 'Bob')).toEqual(['Noto Sans'])
  })

  it('compiles every script in the table', () => {
    expect(() => fallbackFamilies('unknown', 'x')).not.toThrow()
  })
})
