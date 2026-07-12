import { describe, it, expect } from 'vitest'
import { fractionalToDecimal } from './fractional'

describe('fractionalToDecimal', () => {
  it('converts fractional strings to decimal odds', () => {
    expect(fractionalToDecimal('16/5')).toBe(4.2)
    expect(fractionalToDecimal('1/1')).toBe(2)
    expect(fractionalToDecimal('9/10')).toBe(1.9)
    expect(fractionalToDecimal('2/7')).toBe(1.286)
    expect(fractionalToDecimal(' 11/10 ')).toBe(2.1)
  })

  it('rejects anything that is not a positive fraction', () => {
    expect(fractionalToDecimal('')).toBeNull()
    expect(fractionalToDecimal(null)).toBeNull()
    expect(fractionalToDecimal(undefined)).toBeNull()
    expect(fractionalToDecimal('2.5')).toBeNull()
    expect(fractionalToDecimal('abc')).toBeNull()
    expect(fractionalToDecimal('1/0')).toBeNull()
    expect(fractionalToDecimal('-1/2')).toBeNull()
    expect(fractionalToDecimal('1/2/3')).toBeNull()
  })
})
