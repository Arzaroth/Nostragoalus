import { createHmac, timingSafeEqual } from 'node:crypto'

// A share token is a stateless, signed capability: it names a prediction, the
// card mode, and the locale to render. No DB row - the HMAC over the app secret
// is what makes it unforgeable, so a third party can't craft a token to unseal
// someone else's pre-kickoff pick. Minting (which checks ownership) is the only
// place a valid token is produced; this module just signs and verifies.

export const SHARE_MODES = ['result', 'sealed', 'reveal'] as const
export type ShareMode = (typeof SHARE_MODES)[number]

export const SHARE_LOCALES = ['en', 'fr', 'th', 'tlh', 'ar'] as const
export type ShareLocale = (typeof SHARE_LOCALES)[number]

export interface ShareTokenPayload {
  // prediction id
  p: string
  // mode
  m: ShareMode
  // locale
  l: ShareLocale
  // payload version, so the format can evolve without honouring stale tokens
  v: 1
}

// Domain-separate the signing key from the raw auth secret: a share token HMAC
// can then never collide with anything else signed under the same secret.
function shareKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('nostragoalus/share-card/v1').digest()
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

// Exported so tests can forge an authentically-MACed token over a deliberately
// malformed body (to exercise the shape + JSON guards in verify); not used
// elsewhere.
export function signShareBody(secret: string, body: string): string {
  return b64url(createHmac('sha256', shareKey(secret)).update(body).digest())
}

export function signShareToken(secret: string, payload: ShareTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${signShareBody(secret, body)}`
}

function isValidPayload(value: unknown): value is ShareTokenPayload {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    p.v === 1 &&
    typeof p.p === 'string' &&
    p.p.length > 0 &&
    typeof p.m === 'string' &&
    (SHARE_MODES as readonly string[]).includes(p.m) &&
    typeof p.l === 'string' &&
    (SHARE_LOCALES as readonly string[]).includes(p.l)
  )
}

// Returns the payload only when the signature matches AND the shape is valid;
// any tampering, truncation, or unknown field shape yields null (-> 404 at the
// route). Never throws on attacker-controlled input.
// A real token is ~130 chars (small JSON body + 43-char MAC); cap well above that
// so an anonymous caller can't force an unbounded HMAC over a multi-megabyte
// string on these keyless public routes.
const MAX_TOKEN_LENGTH = 512

export function verifyShareToken(secret: string, token: string | undefined): ShareTokenPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const provided = token.slice(dot + 1)
  const expected = signShareBody(secret, body)
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return isValidPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}
