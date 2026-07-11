import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_CATEGORY_ICON, ACHIEVEMENT_TIER_TINT, FALLBACK_ACHIEVEMENT_ICON } from './achievementIcons'

describe('achievementIcons', () => {
  it('maps every badge category to a primeicon, including SHAME', () => {
    // The SHAME thumbs-down once lived only in the cabinet; both surfaces read this map now.
    expect(ACHIEVEMENT_CATEGORY_ICON.SHAME).toBe('pi pi-thumbs-down')
    for (const cat of ['MILESTONE', 'BEHAVIORAL', 'CROWD', 'JOKER', 'ORACLE', 'STREAK', 'TROPHY_META', 'SHAME', 'SECRET']) {
      expect(ACHIEVEMENT_CATEGORY_ICON[cat]).toMatch(/^pi pi-/)
    }
  })

  it('maps each tier to a tint and exposes a generic fallback', () => {
    expect(Object.keys(ACHIEVEMENT_TIER_TINT)).toEqual(['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'])
    expect(FALLBACK_ACHIEVEMENT_ICON).toBe('pi pi-verified')
  })
})
