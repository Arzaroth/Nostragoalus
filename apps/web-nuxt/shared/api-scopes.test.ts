import { describe, it, expect } from 'vitest'
import { API_SCOPES, GRANTABLE_SCOPES, isGrantableScope, permsFromScopes, scopesByResource } from './api-scopes'

describe('api-scopes registry', () => {
  it('GRANTABLE_SCOPES mirrors API_SCOPES as resource:action strings', () => {
    expect(GRANTABLE_SCOPES).toEqual(API_SCOPES.map((s) => `${s.resource}:${s.action}`))
    expect(GRANTABLE_SCOPES).toContain('media:write')
    expect(GRANTABLE_SCOPES).toContain('leaderboard:read')
  })

  it('isGrantableScope accepts known scopes, rejects everything else', () => {
    expect(isGrantableScope('media:write')).toBe(true)
    expect(isGrantableScope('leaderboard:read')).toBe(true)
    expect(isGrantableScope('media:read')).toBe(false)
    expect(isGrantableScope('garbage')).toBe(false)
  })

  it('permsFromScopes maps to the verifier shape and skips unparseable entries', () => {
    expect(permsFromScopes(['media:write'])).toEqual({ media: ['write'] })
    expect(permsFromScopes(['media:write', 'leaderboard:read'])).toEqual({ media: ['write'], leaderboard: ['read'] })
    // Two actions on one resource exercise the "resource already seen" branch.
    expect(permsFromScopes(['media:write', 'media:write'])).toEqual({ media: ['write', 'write'] })
    expect(permsFromScopes(['nocolon', ''])).toEqual({})
  })

  it('scopesByResource groups by resource, preserving declared order', () => {
    const groups = scopesByResource()
    expect(groups.map((g) => g.resource)).toEqual([...new Set(API_SCOPES.map((s) => s.resource))])
    for (const g of groups) for (const s of g.scopes) expect(s.resource).toBe(g.resource)
  })
})
