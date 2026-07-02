import { describe, expect, it } from 'vitest'
import { signShareToken } from '../server/utils/share/token'
import { signWrappedBody, signWrappedToken, verifyWrappedToken } from '../server/utils/share/wrapped-token'

const SECRET = 'test-secret'

describe('wrapped share token', () => {
  it('round-trips a valid payload', () => {
    const token = signWrappedToken(SECRET, { u: 'user-1', c: 'comp-1', l: 'fr', v: 1 })
    expect(verifyWrappedToken(SECRET, token)).toEqual({ u: 'user-1', c: 'comp-1', l: 'fr', v: 1 })
  })

  it('rejects tampering, truncation and wrong secrets', () => {
    const token = signWrappedToken(SECRET, { u: 'user-1', c: 'comp-1', l: 'en', v: 1 })
    expect(verifyWrappedToken('other-secret', token)).toBeNull()
    expect(verifyWrappedToken(SECRET, token.slice(0, -2))).toBeNull()
    expect(verifyWrappedToken(SECRET, `x${token}`)).toBeNull()
    expect(verifyWrappedToken(SECRET, undefined)).toBeNull()
    expect(verifyWrappedToken(SECRET, '')).toBeNull()
    expect(verifyWrappedToken(SECRET, 'no-dot')).toBeNull()
    expect(verifyWrappedToken(SECRET, `.${token}`)).toBeNull()
  })

  it('rejects an oversized token without verifying it', () => {
    expect(verifyWrappedToken(SECRET, 'a.'.padEnd(600, 'b'))).toBeNull()
  })

  it('rejects an authentically MACed but malformed body', () => {
    const body = Buffer.from(JSON.stringify({ v: 1, u: '', c: 'comp', l: 'en' })).toString('base64url')
    expect(verifyWrappedToken(SECRET, `${body}.${signWrappedBody(SECRET, body)}`)).toBeNull()
    const badLocale = Buffer.from(JSON.stringify({ v: 1, u: 'u', c: 'c', l: 'xx' })).toString('base64url')
    expect(verifyWrappedToken(SECRET, `${badLocale}.${signWrappedBody(SECRET, badLocale)}`)).toBeNull()
    const notJson = Buffer.from('nope').toString('base64url')
    expect(verifyWrappedToken(SECRET, `${notJson}.${signWrappedBody(SECRET, notJson)}`)).toBeNull()
    // Valid JSON that is not an object at all.
    for (const raw of ['123', 'null', '"str"']) {
      const body = Buffer.from(raw).toString('base64url')
      expect(verifyWrappedToken(SECRET, `${body}.${signWrappedBody(SECRET, body)}`)).toBeNull()
    }
  })

  it('is domain-separated from the prediction share token', () => {
    // A prediction token signed under the same secret must never verify as a
    // wrapped token, even with a compatible-looking body.
    const predToken = signShareToken(SECRET, { p: 'pred-1', m: 'result', l: 'en', v: 1 })
    expect(verifyWrappedToken(SECRET, predToken)).toBeNull()
  })
})
