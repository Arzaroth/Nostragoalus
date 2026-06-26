import { describe, it, expect } from 'vitest'
import { signFeedBody, signFeedToken, verifyFeedToken } from './token'

const SECRET = 'test-secret'

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url')
}

describe('feed token', () => {
  it('round-trips a valid payload', () => {
    const token = signFeedToken(SECRET, { u: 'user-1', l: 'fr', v: 1 })
    expect(verifyFeedToken(SECRET, token)).toEqual({ u: 'user-1', l: 'fr', v: 1 })
  })

  it('rejects a token signed with a different secret', () => {
    const token = signFeedToken(SECRET, { u: 'user-1', l: 'en', v: 1 })
    expect(verifyFeedToken('other-secret', token)).toBeNull()
  })

  it('rejects a tampered body', () => {
    const token = signFeedToken(SECRET, { u: 'user-1', l: 'en', v: 1 })
    const [, mac] = token.split('.')
    const forged = `${b64url(JSON.stringify({ u: 'user-2', l: 'en', v: 1 }))}.${mac}`
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
    const body = b64url(JSON.stringify({ u: 'user-1', l: 'en', v: 1 }))
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
      { u: 'user-1', l: 'en' }, // missing v
      { u: 'user-1', l: 'klingon', v: 1 }, // unknown locale
      { u: 'user-1', l: 5, v: 1 }, // non-string locale
      { u: '', l: 'en', v: 1 }, // empty user
      { u: 1, l: 'en', v: 1 }, // non-string user
      { l: 'en', v: 1 }, // missing user
    ]
    for (const c of cases) {
      const body = b64url(JSON.stringify(c))
      const token = `${body}.${signFeedBody(SECRET, body)}`
      expect(verifyFeedToken(SECRET, token)).toBeNull()
    }
  })
})
