import { describe, expect, it } from 'vitest'
import { createUserCompetitionCardCodec } from '../server/utils/share/card-token'
import { signProfileToken, verifyProfileToken } from '../server/utils/share/profile-token'
import { signAnalyticsToken, verifyAnalyticsToken } from '../server/utils/share/analytics-token'
import { signWrappedToken } from '../server/utils/share/wrapped-token'

const SECRET = 'test-secret'
const codec = createUserCompetitionCardCodec('nostragoalus/test-card/v1')

describe('user-competition card token', () => {
  it('round-trips a valid payload and stamps a default expiry', () => {
    const nowMs = 1_700_000_000_000
    const token = codec.sign(SECRET, { u: 'user-1', c: 'comp-1', l: 'fr', v: 1 }, nowMs)
    const payload = codec.verify(SECRET, token, nowMs)
    expect(payload).toMatchObject({ u: 'user-1', c: 'comp-1', l: 'fr', v: 1 })
    // Default TTL is stamped when the caller omits x.
    expect(payload?.x).toBeGreaterThan(Math.floor(nowMs / 1000))
  })

  it('honours an explicit expiry and rejects an expired token', () => {
    const exp = 1_700_000_000
    const token = codec.sign(SECRET, { u: 'u', c: 'c', l: 'en', x: exp, v: 1 })
    expect(codec.verify(SECRET, token, exp * 1000 - 1000)).not.toBeNull()
    // One second past expiry: gone.
    expect(codec.verify(SECRET, token, (exp + 1) * 1000)).toBeNull()
  })

  it('rejects tampering, truncation, wrong secret and oversized input', () => {
    const token = codec.sign(SECRET, { u: 'u', c: 'c', l: 'en', v: 1 })
    expect(codec.verify('other', token)).toBeNull()
    expect(codec.verify(SECRET, token.slice(0, -2))).toBeNull()
    expect(codec.verify(SECRET, undefined)).toBeNull()
    expect(codec.verify(SECRET, 'a.'.padEnd(600, 'b'))).toBeNull()
  })

  it('rejects authentically-MACed but malformed bodies', () => {
    const forge = (raw: string) => {
      const body = Buffer.from(raw).toString('base64url')
      return `${body}.${codec.signBody(SECRET, body)}`
    }
    expect(codec.verify(SECRET, forge(JSON.stringify({ v: 1, u: '', c: 'c', l: 'en' })))).toBeNull()
    expect(codec.verify(SECRET, forge(JSON.stringify({ v: 1, u: 'u', c: '', l: 'en' })))).toBeNull()
    expect(codec.verify(SECRET, forge(JSON.stringify({ v: 1, u: 'u', c: 'c', l: 'xx' })))).toBeNull()
    expect(codec.verify(SECRET, forge(JSON.stringify({ v: 2, u: 'u', c: 'c', l: 'en' })))).toBeNull()
    expect(codec.verify(SECRET, forge(JSON.stringify({ v: 1, u: 'u', c: 'c', l: 'en', x: 'soon' })))).toBeNull()
    expect(codec.verify(SECRET, forge('nope'))).toBeNull()
    for (const raw of ['123', 'null', '"str"']) expect(codec.verify(SECRET, forge(raw))).toBeNull()
  })

  it('is domain-separated across card families', () => {
    const payload = { u: 'u', c: 'c', l: 'en', v: 1 } as const
    const profile = signProfileToken(SECRET, payload)
    const analytics = signAnalyticsToken(SECRET, payload)
    const wrapped = signWrappedToken(SECRET, payload)
    expect(verifyProfileToken(SECRET, profile)).not.toBeNull()
    expect(verifyAnalyticsToken(SECRET, analytics)).not.toBeNull()
    // A token from one family never validates as another.
    expect(verifyProfileToken(SECRET, analytics)).toBeNull()
    expect(verifyProfileToken(SECRET, wrapped)).toBeNull()
    expect(verifyAnalyticsToken(SECRET, profile)).toBeNull()
  })
})
