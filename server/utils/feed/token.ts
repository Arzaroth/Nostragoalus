import { createSignedTokenCodec } from '../signed-token/codec'
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
  // the user's feed-token version at mint time; the .ics route rejects the token
  // when it no longer matches user.feedTokenVersion, giving per-user revocation.
  fv: number
  // payload version, so the format can evolve without honouring stale tokens
  v: 1
}

function isValidPayload(value: unknown): value is FeedTokenPayload {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    p.v === 1 &&
    typeof p.u === 'string' &&
    p.u.length > 0 &&
    typeof p.fv === 'number' &&
    Number.isInteger(p.fv) &&
    p.fv >= 0 &&
    typeof p.l === 'string' &&
    (FEED_LOCALES as readonly string[]).includes(p.l)
  )
}

// The signing/verify path (b64url, domain-separated HMAC, timing-safe compare,
// 512-char cap -> null on any tampering) lives in the shared codec; this module
// only pins the domain tag and the payload shape.
const codec = createSignedTokenCodec<FeedTokenPayload>('nostragoalus/ical-feed/v1', isValidPayload)

// Exposed so tests can forge an authentically-MACed token over a deliberately
// malformed body (to exercise the shape + JSON guards in verify).
export const signFeedBody = codec.signBody
export const signFeedToken = codec.sign
export const verifyFeedToken = codec.verify
