import { describe, it, expect } from 'vitest'
import { canKick, canManageLeague, canSeeJoinCode, type LeagueRole } from './permissions'

const ROLES: LeagueRole[] = ['OWNER', 'MODERATOR', 'MEMBER']

describe('canManageLeague', () => {
  it('allows owner and moderator only', () => {
    expect(canManageLeague('OWNER')).toBe(true)
    expect(canManageLeague('MODERATOR')).toBe(true)
    expect(canManageLeague('MEMBER')).toBe(false)
    expect(canManageLeague(null)).toBe(false)
    expect(canManageLeague(undefined)).toBe(false)
  })
})

describe('canKick', () => {
  it('matches the full role matrix', () => {
    const allowed: Array<[LeagueRole, LeagueRole]> = [
      ['OWNER', 'MODERATOR'],
      ['OWNER', 'MEMBER'],
      ['MODERATOR', 'MEMBER'],
    ]
    for (const actor of ROLES) {
      for (const target of ROLES) {
        const expected = allowed.some(([a, t]) => a === actor && t === target)
        expect(canKick(actor, target), `${actor} kicks ${target}`).toBe(expected)
      }
    }
  })

  it('denies non-members on either side', () => {
    expect(canKick(null, 'MEMBER')).toBe(false)
    expect(canKick('OWNER', null)).toBe(false)
    expect(canKick(undefined, undefined)).toBe(false)
    expect(canKick('MODERATOR', undefined)).toBe(false)
  })
})

describe('canSeeJoinCode', () => {
  it('allows owner and moderator only', () => {
    expect(canSeeJoinCode('OWNER')).toBe(true)
    expect(canSeeJoinCode('MODERATOR')).toBe(true)
    expect(canSeeJoinCode('MEMBER')).toBe(false)
    expect(canSeeJoinCode(null)).toBe(false)
    expect(canSeeJoinCode(undefined)).toBe(false)
  })
})
