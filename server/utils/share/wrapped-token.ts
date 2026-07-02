import { createHmac, timingSafeEqual } from 'node:crypto'
import { SHARE_LOCALES, type ShareLocale } from './token'

// The wrapped share token mirrors the prediction share token (stateless, HMAC
// signed) but names a user + competition instead of a prediction. Its own
// domain separation string means the two token families can never be swapped.

export interface WrappedTokenPayload {
  // user id
  u: string
  // competition id
  c: string
  // locale
  l: ShareLocale
  v: 1
}

function wrappedKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('nostragoalus/wrapped-card/v1').digest()
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

export function signWrappedBody(secret: string, body: string): string {
  return b64url(createHmac('sha256', wrappedKey(secret)).update(body).digest())
}

export function signWrappedToken(secret: string, payload: WrappedTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${signWrappedBody(secret, body)}`
}

function isValidPayload(value: unknown): value is WrappedTokenPayload {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    p.v === 1 &&
    typeof p.u === 'string' &&
    p.u.length > 0 &&
    typeof p.c === 'string' &&
    p.c.length > 0 &&
    typeof p.l === 'string' &&
    (SHARE_LOCALES as readonly string[]).includes(p.l)
  )
}

// Same cap rationale as the prediction token: an anonymous caller must not be
// able to force an HMAC over unbounded input on a keyless public route.
const MAX_TOKEN_LENGTH = 512

export function verifyWrappedToken(secret: string, token: string | undefined): WrappedTokenPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const provided = token.slice(dot + 1)
  const expected = signWrappedBody(secret, body)
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
