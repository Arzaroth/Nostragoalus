import { createHmac, timingSafeEqual } from 'node:crypto'
import { SHARE_LOCALES, type ShareLocale } from '../share/token'

// A calendar-feed token is a stateless, signed capability naming the user whose
// fixtures + pick deadlines the .ics should carry, and the locale to render its
// event text in. No DB row - the HMAC over the app secret is what makes it
// unforgeable, so a third party can't craft a token to read another user's feed.
// It is deterministic (same user + locale -> same token), so the subscription
// URL is stable and a calendar client can poll it. Stateless means it can only
// be revoked by rotating the app secret (acceptable: the feed exposes public
// fixtures + which matches you have predicted, never the predicted scores).

export const FEED_LOCALES = SHARE_LOCALES
export type FeedLocale = ShareLocale

export interface FeedTokenPayload {
  // user id whose feed this is
  u: string
  // locale for the event text
  l: FeedLocale
  // payload version, so the format can evolve without honouring stale tokens
  v: 1
}

// Domain-separate the signing key from the raw auth secret so a feed token HMAC
// can never collide with anything else signed under the same secret.
function feedKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('nostragoalus/ical-feed/v1').digest()
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

// Exported so tests can forge an authentically-MACed token over a deliberately
// malformed body (to exercise the shape + JSON guards in verify).
export function signFeedBody(secret: string, body: string): string {
  return b64url(createHmac('sha256', feedKey(secret)).update(body).digest())
}

export function signFeedToken(secret: string, payload: FeedTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${signFeedBody(secret, body)}`
}

function isValidPayload(value: unknown): value is FeedTokenPayload {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    p.v === 1 &&
    typeof p.u === 'string' &&
    p.u.length > 0 &&
    typeof p.l === 'string' &&
    (FEED_LOCALES as readonly string[]).includes(p.l)
  )
}

// Returns the payload only when the signature matches AND the shape is valid;
// any tampering, truncation, or unknown field shape yields null (-> 404 at the
// route). Never throws on attacker-controlled input. Cap the length so an
// anonymous caller can't force an unbounded HMAC on this keyless public route.
const MAX_TOKEN_LENGTH = 512

export function verifyFeedToken(secret: string, token: string | undefined): FeedTokenPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const provided = token.slice(dot + 1)
  const expected = signFeedBody(secret, body)
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
