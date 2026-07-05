import { createSignedTokenCodec } from '../signed-token/codec'
import { SHARE_LOCALES, SHARE_TTL_SECONDS, type ShareLocale } from './token'

// The wrapped share token mirrors the prediction share token (stateless, HMAC
// signed, bounded lifetime) but names a user + competition instead of a
// prediction. Its own domain-separation tag means the two token families can
// never be swapped. It goes through the shared codec (same b64url + timing-safe
// compare + 512-char cap + empty-secret refusal) rather than re-implementing it.

export interface WrappedTokenPayload {
  // user id
  u: string
  // competition id
  c: string
  // locale
  l: ShareLocale
  // expiry, unix seconds (optional: pre-expiry tokens omit it and never expire)
  x?: number
  v: 1
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
    (SHARE_LOCALES as readonly string[]).includes(p.l) &&
    (p.x === undefined || (typeof p.x === 'number' && Number.isFinite(p.x)))
  )
}

const codec = createSignedTokenCodec<WrappedTokenPayload>('nostragoalus/wrapped-card/v1', isValidPayload)

// Exposed so tests can forge an authentically-MACed token over a malformed body.
export const signWrappedBody = codec.signBody

export function signWrappedToken(secret: string, payload: WrappedTokenPayload, nowMs: number = Date.now()): string {
  return codec.sign(secret, { ...payload, x: payload.x ?? Math.floor(nowMs / 1000) + SHARE_TTL_SECONDS })
}

export function verifyWrappedToken(secret: string, token: string | undefined, nowMs: number = Date.now()): WrappedTokenPayload | null {
  const payload = codec.verify(secret, token)
  if (!payload) return null
  if (payload.x !== undefined && payload.x < Math.floor(nowMs / 1000)) return null
  return payload
}
