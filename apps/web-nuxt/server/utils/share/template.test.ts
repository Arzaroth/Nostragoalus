import { describe, expect, it } from 'vitest'
import { shareName } from './template'

describe('shareName', () => {
  it('leaves a name that fits untouched', () => {
    expect(shareName('Bob')).toBe('Bob')
  })

  it('caps an overlong name', () => {
    expect(shareName('a'.repeat(60))).toBe(`${'a'.repeat(40)}...`)
  })

  it('counts code points, so astral glyphs are never cut in half', () => {
    const name = '🔥'.repeat(50)
    expect(shareName(name)).toBe(`${'🔥'.repeat(40)}...`)
    expect(shareName('🔥'.repeat(40))).toBe('🔥'.repeat(40))
  })
})
