import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, ALL_ACHIEVEMENTS, PONY_ACHIEVEMENT_KEY, tierForValue } from './catalog'

describe('tierForValue', () => {
  const graded = [
    { tier: 'BRONZE' as const, threshold: 5 },
    { tier: 'SILVER' as const, threshold: 15 },
    { tier: 'GOLD' as const, threshold: 30 },
  ]

  it('returns the highest tier the value meets', () => {
    expect(tierForValue(graded, 4)).toBeNull()
    expect(tierForValue(graded, 5)).toBe('BRONZE')
    expect(tierForValue(graded, 14)).toBe('BRONZE')
    expect(tierForValue(graded, 15)).toBe('SILVER')
    expect(tierForValue(graded, 30)).toBe('GOLD')
    expect(tierForValue(graded, 1000)).toBe('GOLD')
  })

  it('handles single-tier badges', () => {
    const single = [{ tier: 'BRONZE' as const, threshold: 1 }]
    expect(tierForValue(single, 0)).toBeNull()
    expect(tierForValue(single, 1)).toBe('BRONZE')
  })
})

describe('catalog', () => {
  it('every batch achievement grades a metric; keys are unique', () => {
    expect(ACHIEVEMENTS.every((a) => a.metric)).toBe(true)
    const keys = ALL_ACHIEVEMENTS.map((a) => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('the pony badge is a hidden, global secret excluded from batch evaluation', () => {
    const pony = ALL_ACHIEVEMENTS.find((a) => a.key === PONY_ACHIEVEMENT_KEY)!
    expect(pony).toMatchObject({ hidden: true, scope: 'GLOBAL', category: 'SECRET' })
    expect(pony.metric).toBeUndefined()
    expect(ACHIEVEMENTS.some((a) => a.key === PONY_ACHIEVEMENT_KEY)).toBe(false)
  })
})
