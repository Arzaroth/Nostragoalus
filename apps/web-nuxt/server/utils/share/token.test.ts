import { describe, it, expect } from 'vitest'
import { signShareBody, signShareToken, verifyShareToken, SHARE_TTL_SECONDS } from './token'
import { signWrappedBody, signWrappedToken, verifyWrappedToken } from './wrapped-token'

const SECRET = 'test-secret'
const NOW = 1_700_000_000_000

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url')
}

describe('share token', () => {
  it('round-trips and stamps an expiry TTL from now', () => {
    const token = signShareToken(SECRET, { p: 'pred-1', m: 'sealed', l: 'en', v: 1 }, NOW)
    const payload = verifyShareToken(SECRET, token, NOW)
    expect(payload).toMatchObject({ p: 'pred-1', m: 'sealed', l: 'en', v: 1 })
    expect(payload?.x).toBe(Math.floor(NOW / 1000) + SHARE_TTL_SECONDS)
  })

  it('rejects an expired token', () => {
    const token = signShareToken(SECRET, { p: 'pred-1', m: 'reveal', l: 'en', v: 1 }, NOW)
    // One second past expiry.
    const expiredAt = NOW + (SHARE_TTL_SECONDS + 1) * 1000
    expect(verifyShareToken(SECRET, token, expiredAt)).toBeNull()
    // Still valid just before.
    expect(verifyShareToken(SECRET, token, NOW + (SHARE_TTL_SECONDS - 1) * 1000)).not.toBeNull()
  })

  it('honours a token with no expiry (back-compat) forever', () => {
    const body = b64url(JSON.stringify({ p: 'pred-1', m: 'result', l: 'en', v: 1 }))
    const token = `${body}.${signShareBody(SECRET, body)}`
    expect(verifyShareToken(SECRET, token, NOW + 10 ** 13)).toMatchObject({ p: 'pred-1' })
  })

  it('rejects a wrong secret and a bad expiry type', () => {
    const token = signShareToken(SECRET, { p: 'pred-1', m: 'sealed', l: 'en', v: 1 }, NOW)
    expect(verifyShareToken('other', token, NOW)).toBeNull()
    const body = b64url(JSON.stringify({ p: 'p', m: 'sealed', l: 'en', x: 'soon', v: 1 }))
    expect(verifyShareToken(SECRET, `${body}.${signShareBody(SECRET, body)}`, NOW)).toBeNull()
  })
})

describe('wrapped token', () => {
  it('round-trips and expires like the share token', () => {
    const token = signWrappedToken(SECRET, { u: 'u1', c: 'wc-2026', l: 'fr', v: 1 }, NOW)
    expect(verifyWrappedToken(SECRET, token, NOW)).toMatchObject({ u: 'u1', c: 'wc-2026', l: 'fr', v: 1 })
    expect(verifyWrappedToken(SECRET, token, NOW + (SHARE_TTL_SECONDS + 1) * 1000)).toBeNull()
  })

  it('does not cross-validate with the share domain tag', () => {
    const share = signShareToken(SECRET, { p: 'p', m: 'sealed', l: 'en', v: 1 }, NOW)
    expect(verifyWrappedToken(SECRET, share, NOW)).toBeNull()
    const wrapped = signWrappedToken(SECRET, { u: 'u1', c: 'c1', l: 'en', v: 1 }, NOW)
    expect(verifyShareToken(SECRET, wrapped, NOW)).toBeNull()
  })

  it('rejects a malformed wrapped body under an authentic MAC', () => {
    const body = b64url(JSON.stringify({ u: '', c: 'c1', l: 'en', v: 1 }))
    expect(verifyWrappedToken(SECRET, `${body}.${signWrappedBody(SECRET, body)}`, NOW)).toBeNull()
  })
})
