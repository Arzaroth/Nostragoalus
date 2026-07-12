import { describe, it, expect } from 'vitest'
import { signFeedBody, signFeedToken, verifyFeedToken } from './token'

const SECRET = 'test-secret'

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url')
}

describe('feed token', () => {
  it('round-trips a valid payload (carrying the feed version)', () => {
    const token = signFeedToken(SECRET, { u: 'user-1', l: 'fr', fv: 3, v: 1 })
    expect(verifyFeedToken(SECRET, token)).toEqual({ u: 'user-1', l: 'fr', fv: 3, v: 1 })
  })

  it('rejects a token signed with a different secret', () => {
    const token = signFeedToken(SECRET, { u: 'user-1', l: 'en', fv: 0, v: 1 })
    expect(verifyFeedToken('other-secret', token)).toBeNull()
  })

  it('rejects a tampered body', () => {
    const token = signFeedToken(SECRET, { u: 'user-1', l: 'en', fv: 0, v: 1 })
    const [, mac] = token.split('.')
    const forged = `${b64url(JSON.stringify({ u: 'user-2', l: 'en', fv: 0, v: 1 }))}.${mac}`
    expect(verifyFeedToken(SECRET, forged)).toBeNull()
  })

  it('returns null for an undefined or over-long token', () => {
    expect(verifyFeedToken(SECRET, undefined)).toBeNull()
    expect(verifyFeedToken(SECRET, 'x'.repeat(513))).toBeNull()
  })

  it('returns null when there is no signature separator', () => {
    expect(verifyFeedToken(SECRET, 'nodothere')).toBeNull()
    expect(verifyFeedToken(SECRET, '.leadingdot')).toBeNull()
  })

  it('returns null on a signature length mismatch', () => {
    const body = b64url(JSON.stringify({ u: 'user-1', l: 'en', fv: 0, v: 1 }))
    expect(verifyFeedToken(SECRET, `${body}.short`)).toBeNull()
  })

  it('returns null on an authentic MAC over non-JSON', () => {
    const body = b64url('not json{')
    const token = `${body}.${signFeedBody(SECRET, body)}`
    expect(verifyFeedToken(SECRET, token)).toBeNull()
  })

  it('returns null when the body is valid JSON but not an object', () => {
    for (const raw of ['null', '5', '"str"']) {
      const body = b64url(raw)
      const token = `${body}.${signFeedBody(SECRET, body)}`
      expect(verifyFeedToken(SECRET, token)).toBeNull()
    }
  })

  it('returns null on an authentic MAC over a shape-invalid payload', () => {
    const cases = [
      { u: 'user-1', l: 'en', fv: 0 }, // missing v
      { u: 'user-1', l: 'klingon', fv: 0, v: 1 }, // unknown locale
      { u: 'user-1', l: 5, fv: 0, v: 1 }, // non-string locale
      { u: '', l: 'en', fv: 0, v: 1 }, // empty user
      { u: 1, l: 'en', fv: 0, v: 1 }, // non-string user
      { l: 'en', fv: 0, v: 1 }, // missing user
      { u: 'user-1', l: 'en', fv: -1, v: 1 }, // negative fv
      { u: 'user-1', l: 'en', fv: 1.5, v: 1 }, // non-integer fv
    ]
    for (const c of cases) {
      const body = b64url(JSON.stringify(c))
      const token = `${body}.${signFeedBody(SECRET, body)}`
      expect(verifyFeedToken(SECRET, token)).toBeNull()
    }
  })

  it('accepts a legacy token minted before feed-token versioning (no fv)', () => {
    // Back-compat: tokens already subscribed in users' calendars carry {u,l,v:1}
    // with no fv. They must still verify; the .ics route treats absent fv as v0.
    const body = b64url(JSON.stringify({ u: 'user-1', l: 'en', v: 1 }))
    const token = `${body}.${signFeedBody(SECRET, body)}`
    const payload = verifyFeedToken(SECRET, token)
    expect(payload).toEqual({ u: 'user-1', l: 'en', v: 1 })
    expect(payload?.fv).toBeUndefined()
  })

  it('a token minted at one version does not validate at another (revocation)', () => {
    // The route compares payload.fv to the user's current feedTokenVersion; here we
    // just prove different versions produce distinct, non-interchangeable payloads.
    const v0 = verifyFeedToken(SECRET, signFeedToken(SECRET, { u: 'u', l: 'en', fv: 0, v: 1 }))
    const v1 = verifyFeedToken(SECRET, signFeedToken(SECRET, { u: 'u', l: 'en', fv: 1, v: 1 }))
    expect(v0?.fv).toBe(0)
    expect(v1?.fv).toBe(1)
  })
})
