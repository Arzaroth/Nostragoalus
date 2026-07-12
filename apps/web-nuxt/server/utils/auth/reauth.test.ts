import { describe, it, expect } from 'vitest'
import { checkReauth, issueReauth } from './reauth'

describe('reauth tokens', () => {
  it('validates a fresh token for its user only, and expires', () => {
    const t0 = 1_000_000
    const token = issueReauth('u1', 5 * 60_000, t0)
    expect(checkReauth(token, 'u1', t0 + 1000)).toBe(true)
    expect(checkReauth(token, 'u2', t0 + 1000)).toBe(false)
    expect(checkReauth(token, 'u1', t0 + 6 * 60_000)).toBe(false) // expired
    expect(checkReauth(token, 'u1', t0 + 1000)).toBe(false) // expired tokens are evicted
    expect(checkReauth(undefined, 'u1')).toBe(false)
    expect(checkReauth('bogus', 'u1')).toBe(false)
  })
})
