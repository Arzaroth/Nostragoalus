import { describe, it, expect } from 'vitest'
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, generateJoinCode, normalizeJoinCode } from './code'

describe('generateJoinCode', () => {
  it('produces codes of the default length from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode()
      expect(code).toHaveLength(JOIN_CODE_LENGTH)
      for (const ch of code) expect(JOIN_CODE_ALPHABET).toContain(ch)
    }
  })

  it('respects a custom length', () => {
    expect(generateJoinCode(12)).toHaveLength(12)
    expect(generateJoinCode(0)).toBe('')
  })

  it('excludes ambiguous characters', () => {
    for (const ch of 'ILOU01') expect(JOIN_CODE_ALPHABET).not.toContain(ch)
  })
})

describe('normalizeJoinCode', () => {
  it('uppercases and strips whitespace and dashes', () => {
    expect(normalizeJoinCode('  ab-cd ef\t')).toBe('ABCDEF')
    expect(normalizeJoinCode('a b-c-d')).toBe('ABCD')
  })

  it('leaves other characters alone so bad codes fail lookup naturally', () => {
    expect(normalizeJoinCode('abc!é9')).toBe('ABC!É9')
    expect(normalizeJoinCode('')).toBe('')
  })
})
