import { describe, expect, it } from 'vitest'
import { signShareBody, signShareToken, verifyShareToken, type ShareTokenPayload } from '../server/utils/share/token'

const SECRET = 'unit-test-share-secret'
const payload: ShareTokenPayload = { p: 'pred-123', m: 'reveal', l: 'fr', v: 1 }

// Forge an authentically-MACed token over any body so verify's post-MAC guards
// (shape, JSON) are reachable, not short-circuited at the signature check.
function forge(value: unknown): string {
  const body = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
  return `${body}.${signShareBody(SECRET, body)}`
}

describe('share token', () => {
  it('round-trips a signed payload', () => {
    expect(verifyShareToken(SECRET, signShareToken(SECRET, payload))).toEqual(payload)
  })

  it('rejects a tampered body (MAC mismatch)', () => {
    const [, sig] = signShareToken(SECRET, payload).split('.')
    const otherBody = Buffer.from(JSON.stringify({ ...payload, p: 'pred-999' })).toString('base64url')
    expect(verifyShareToken(SECRET, `${otherBody}.${sig}`)).toBeNull()
  })

  it('rejects a tampered signature and a length-mismatched signature', () => {
    const token = signShareToken(SECRET, payload)
    expect(verifyShareToken(SECRET, `${token}x`)).toBeNull()
    const [body] = token.split('.')
    expect(verifyShareToken(SECRET, `${body}.short`)).toBeNull()
  })

  it('rejects a different secret', () => {
    expect(verifyShareToken('other-secret', signShareToken(SECRET, payload))).toBeNull()
  })

  it('rejects missing / malformed tokens', () => {
    expect(verifyShareToken(SECRET, undefined)).toBeNull()
    expect(verifyShareToken(SECRET, '')).toBeNull()
    expect(verifyShareToken(SECRET, 'nodot')).toBeNull()
    expect(verifyShareToken(SECRET, '.sig')).toBeNull()
  })

  it('rejects MAC-valid tokens with an invalid payload shape', () => {
    const bad: unknown[] = [
      null,
      42,
      { p: 'x', m: 'reveal', l: 'fr', v: 2 },
      { p: 42, m: 'reveal', l: 'fr', v: 1 },
      { p: '', m: 'reveal', l: 'fr', v: 1 },
      { p: 'x', m: 42, l: 'fr', v: 1 },
      { p: 'x', m: 'bogus', l: 'fr', v: 1 },
      { p: 'x', m: 'reveal', l: 42, v: 1 },
      { p: 'x', m: 'reveal', l: 'xx', v: 1 },
    ]
    for (const value of bad) expect(verifyShareToken(SECRET, forge(value))).toBeNull()
  })

  it('rejects a MAC-valid body that is not JSON', () => {
    expect(verifyShareToken(SECRET, forge('}{ not json'))).toBeNull()
  })
})
