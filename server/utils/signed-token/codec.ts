import { createHmac, timingSafeEqual } from 'node:crypto'

// A stateless, signed capability token: `<base64url(JSON body)>.<base64url(HMAC)>`.
// The HMAC over the app secret is what makes it unforgeable - no DB row. Share
// cards and calendar feeds are the same construction differing only in the
// domain-separation tag and the payload shape, so both go through this codec.
//
// The signing key is domain-separated from the raw auth secret (HMAC(secret,
// domainTag)) so a token minted for one purpose can never validate for another
// under the same secret. `verify` returns the payload only when the signature
// matches AND the decoded shape passes `isValid`; any tampering, truncation,
// unknown-field shape, or oversized input yields null. It never throws on
// attacker-controlled input.

// A real token is ~130 chars (small JSON body + 43-char MAC); cap well above
// that so an anonymous caller can't force an unbounded HMAC over a
// multi-megabyte string on these keyless public routes.
const MAX_TOKEN_LENGTH = 512

export interface SignedTokenCodec<P> {
  sign(secret: string, payload: P): string
  // Exposed for tests: MAC an arbitrary (possibly malformed) body, to exercise
  // verify's shape + JSON guards over an authentically-signed-but-invalid token.
  signBody(secret: string, body: string): string
  verify(secret: string, token: string | undefined): P | null
}

export function createSignedTokenCodec<P>(
  domainTag: string,
  isValid: (value: unknown) => value is P,
): SignedTokenCodec<P> {
  const key = (secret: string): Buffer => createHmac('sha256', secret).update(domainTag).digest()
  const b64url = (buf: Buffer): string => buf.toString('base64url')
  const signBody = (secret: string, body: string): string =>
    b64url(createHmac('sha256', key(secret)).update(body).digest())

  return {
    signBody,
    sign(secret, payload) {
      const body = b64url(Buffer.from(JSON.stringify(payload)))
      return `${body}.${signBody(secret, body)}`
    },
    verify(secret, token) {
      if (!token || token.length > MAX_TOKEN_LENGTH) return null
      const dot = token.indexOf('.')
      if (dot <= 0) return null
      const body = token.slice(0, dot)
      const provided = token.slice(dot + 1)
      const expected = signBody(secret, body)
      const a = Buffer.from(provided)
      const b = Buffer.from(expected)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null
      try {
        const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
        return isValid(parsed) ? parsed : null
      } catch {
        return null
      }
    },
  }
}
