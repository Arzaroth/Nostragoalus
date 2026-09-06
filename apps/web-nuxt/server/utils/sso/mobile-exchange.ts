import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { session, verification } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'
import { createRateLimiter } from '../rate-limit'

// The mobile SSO handoff. better-auth finishes an SSO sign-in by setting a
// session COOKIE and redirecting to callbackURL verbatim; a native app has
// neither a cookie jar nor a way to read one. So the callback route parks the
// bearer behind an opaque code and the app trades that code for it over TLS.
//
// The token must never ride the redirect URL: a URL lands in browser history, in
// every intermediate redirect log, and - until App Links verification is live on
// the device - in an Android intent any app registered for the host can observe.
//
// The code alone is not enough either, for the same reason: whoever can see the
// redirect sees BOTH the code and the state. So the client also generates a
// verifier and sends only its SHA-256 (PKCE-style) through the redirect; the
// exchange requires the verifier itself, which never leaves the app. An observer
// of the redirect therefore holds nothing redeemable.
const PREFIX = '_sso-mobile-'
const TTL_MS = 2 * 60 * 1000

// Where the callback route sends the app. A verified App Link / Universal Link
// on this server's own origin, not a hijackable custom scheme.
export const MOBILE_SSO_CALLBACK_PATH = '/mobile/sso-callback'

// Where better-auth is told to land, which is NOT the App Link above. better-auth
// redirects verbatim after setting the session cookie, so a redirect straight to
// the App Link would reach the app with no credential and no code. This route is
// the one that runs with that cookie. Built here so the authorize route and the
// callback route cannot drift apart.
export const MOBILE_SSO_PARK_PATH = '/api/sso/mobile-callback'

export function mobileSsoParkCallback(state: string, challenge: string): string {
  return `${MOBILE_SSO_PARK_PATH}?${new URLSearchParams({ state, challenge }).toString()}`
}

// Client-generated values are pinned to base64url, so a value that gets reflected
// into a redirect can only ever carry [A-Za-z0-9_-].
const OPAQUE = /^[A-Za-z0-9_-]{16,128}$/

// How new the session must be for the callback to hand it over.
//
// The park route is a public GET that turns a session cookie into a redeemable
// bearer, so without an age bound it hands over whatever session the browser was
// already carrying - months old, nothing to do with this flow. better-auth's SSO
// callback always mints a NEW session (handleOAuthUserInfo ->
// internalAdapter.createSession) and redirects here in the same breath, so the
// legitimate arrival is milliseconds old. Two minutes is slack for a slow IdP hop
// and a phone with a bad clock, and nowhere near a session's life.
//
// Read what this does NOT establish. It is an age check and only an age check:
// it does not prove the session came from SSO, nor that it belongs to the flow
// whose state and challenge are in the query. Any sign-in in the preceding two
// minutes satisfies it, and /api/sso/mobile-authorize can be used to cause one.
// What ultimately keeps a parked code away from an attacker is that only the app
// whose signing certificate the domain vouches for receives the App Link it is
// sent to. This narrows the window; App Links verification is the boundary.
export const MOBILE_SSO_MAX_SESSION_AGE_MS = 2 * 60 * 1000

// Clock skew is a seconds-scale phenomenon, so the tolerance for a session
// stamped in the FUTURE is bounded too. Left open it is not a tolerance but an
// exemption: a host whose clock jumped forward stamps rows hours ahead, and once
// the clock is corrected every one of them stays "fresh" for the rest of its
// life, with the age check switched off for exactly those sessions.
export const MOBILE_SSO_MAX_CLOCK_SKEW_MS = 60 * 1000

// The age is computed IN the database, against the database's own clock.
// better-auth's `session.created_at` is `timestamp` WITHOUT time zone, and
// node-postgres builds a Date for such a column in the Node process's LOCAL
// zone, so comparing it to `new Date()` here reads the age wrong by exactly the
// process offset. That is silent and it breaks both ways: on a UTC+2 host every
// real sign-in looks two hours old and is refused, and on a UTC-4 host every
// session looks four hours in the FUTURE, which this check would have to accept
// (clock skew is not evidence of an attack) - turning it off for a session of
// any age. Prod containers happen to run UTC; nothing enforces that.
export async function isFreshSsoSession(db: AppDatabase, sessionId: string | null | undefined): Promise<boolean> {
  if (!sessionId) return false
  const maxAge = MOBILE_SSO_MAX_SESSION_AGE_MS / 1000
  const maxSkew = MOBILE_SSO_MAX_CLOCK_SKEW_MS / 1000
  const rows = await db
    .select({
      // Stored naive values are UTC wall clock, so `now()` is read as UTC too:
      // that leaves the answer independent of both the Node and the database
      // time zone rather than only the Node one.
      fresh: sql<boolean>`
        (now() at time zone 'utc') - ${session.createdAt} <= make_interval(secs => ${maxAge})
        and ${session.createdAt} - (now() at time zone 'utc') <= make_interval(secs => ${maxSkew})
      `,
    })
    .from(session)
    .where(eq(session.id, sessionId))
    .limit(1)
  return rows[0]?.fresh === true
}

// Ten exchanges a minute per caller is ample for a human sign-in; the budget
// only exists to stop someone grinding the code space.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

export function isOpaqueNonce(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE.test(value)
}

function sha256Url(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

interface Parked {
  state: string
  challenge: string
  token: string
}

// Stores the freshly-minted bearer behind a single-use code bound to the state
// and challenge the client generated. Returns the code for the redirect.
export async function parkMobileSsoToken(
  db: AppDatabase,
  params: { state: string; challenge: string; token: string },
): Promise<string> {
  if (!isOpaqueNonce(params.state) || !isOpaqueNonce(params.challenge)) {
    throw new ValidationError('malformed sso callback')
  }
  if (!params.token) throw new ValidationError('no session to hand off')
  const code = randomBytes(32).toString('base64url')
  await db.insert(verification).values({
    id: randomUUID(),
    // Only the digest is stored, so a database read cannot replay a live code.
    identifier: PREFIX + sha256Url(code),
    value: JSON.stringify({ state: params.state, challenge: params.challenge, token: params.token } satisfies Parked),
    expiresAt: new Date(Date.now() + TTL_MS),
  })
  return code
}

// Trades a code for the parked bearer. Throws on anything that is not a first
// redemption by the client that started the flow.
export async function redeemMobileSsoCode(
  db: AppDatabase,
  params: { code: string; state: string; verifier: string; clientKey: string },
): Promise<string> {
  if (!limiter.allow(params.clientKey)) throw new ValidationError('too many exchange attempts')
  if (!isOpaqueNonce(params.code) || !isOpaqueNonce(params.state) || !isOpaqueNonce(params.verifier)) {
    throw new ValidationError('malformed exchange request')
  }
  // Single-use: DELETE ... RETURNING consumes the row atomically, so two
  // concurrent redemptions can never both come back with a token.
  const rows = await db
    .delete(verification)
    .where(eq(verification.identifier, PREFIX + sha256Url(params.code)))
    .returning({ value: verification.value, expiresAt: verification.expiresAt })
  const row = rows[0]
  if (!row || row.expiresAt <= new Date()) throw new NotFoundError('unknown or expired exchange code')
  const parked = JSON.parse(row.value) as Parked
  // Same error as an unknown code: the endpoint must not tell a prober which of
  // the bindings it got wrong (or that the code existed at all).
  if (parked.state !== params.state || parked.challenge !== sha256Url(params.verifier)) {
    throw new NotFoundError('unknown or expired exchange code')
  }
  return parked.token
}
