import { describe, it, expect } from 'vitest'
import { SKIN_IDS, SKINS, isSkinId, resolveSkin, skinsUnlocked, userSkin } from './skins'

describe('skin model', () => {
  it('exposes the six mane-cast skins, each with a metadata entry', () => {
    expect(SKIN_IDS).toHaveLength(6)
    expect(SKINS).toHaveLength(SKIN_IDS.length)
    for (const id of SKIN_IDS) {
      const meta = SKINS.find((s) => s.id === id)
      expect(meta).toBeDefined()
      expect(meta!.swatch).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('marks exactly Rainbow Dash as the rainbow chip', () => {
    expect(SKINS.filter((s) => s.rainbow).map((s) => s.id)).toEqual(['rainbow'])
  })
})

describe('isSkinId', () => {
  it('accepts known ids only', () => {
    expect(isSkinId('twilight')).toBe(true)
    expect(isSkinId('fluttershy')).toBe(true)
  })

  it('rejects unknown values and non-strings', () => {
    expect(isSkinId('celestia')).toBe(false)
    expect(isSkinId('')).toBe(false)
    expect(isSkinId(null)).toBe(false)
    expect(isSkinId(undefined)).toBe(false)
    expect(isSkinId(7)).toBe(false)
  })
})

describe('resolveSkin', () => {
  it('passes through a valid id', () => {
    expect(resolveSkin('pinkie')).toBe('pinkie')
  })

  it('falls back to null (default theme) for anything else', () => {
    expect(resolveSkin('nope')).toBeNull()
    expect(resolveSkin(null)).toBeNull()
    expect(resolveSkin(undefined)).toBeNull()
    expect(resolveSkin(42)).toBeNull()
  })
})

describe('skinsUnlocked', () => {
  it('is true only on an explicit unlock flag', () => {
    expect(skinsUnlocked({ skinsUnlocked: true })).toBe(true)
  })

  it('is false when unset, false, or signed out', () => {
    expect(skinsUnlocked({ skinsUnlocked: false })).toBe(false)
    expect(skinsUnlocked({ skinsUnlocked: null })).toBe(false)
    expect(skinsUnlocked({})).toBe(false)
    expect(skinsUnlocked(null)).toBe(false)
    expect(skinsUnlocked(undefined)).toBe(false)
  })
})

describe('userSkin', () => {
  it('reads and validates the stored skin', () => {
    expect(userSkin({ skin: 'rarity' })).toBe('rarity')
  })

  it('returns null for missing, signed-out, or garbage values', () => {
    expect(userSkin({ skin: 'discord' })).toBeNull()
    expect(userSkin({})).toBeNull()
    expect(userSkin(null)).toBeNull()
    expect(userSkin(undefined)).toBeNull()
  })
})
