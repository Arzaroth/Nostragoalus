import { createSignedTokenCodec } from '../signed-token/codec'
import { SHARE_LOCALES, SHARE_TTL_SECONDS, type ShareLocale } from './token'

// A stateless, HMAC-signed, time-bounded share token that names a user +
// competition + locale. The wrapped, profile and analytics cards are all the
// same shape and differ only in their domain-separation tag, so they share this
// one factory (payload guard + TTL wiring) instead of each re-declaring it. The
// distinct tag per card type means a token minted for one can never validate for
// another under the same secret. Goes through the shared signed-token codec (same
// b64url + timing-safe compare + 512-char cap + empty-secret refusal).

export interface UserCompetitionCardPayload {
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

export interface UserCompetitionCardCodec {
  // Exposed so tests can forge an authentically-MACed token over a malformed body.
  signBody: (secret: string, body: string) => string
  sign: (secret: string, payload: UserCompetitionCardPayload, nowMs?: number) => string
  verify: (secret: string, token: string | undefined, nowMs?: number) => UserCompetitionCardPayload | null
}

function isValidPayload(value: unknown): value is UserCompetitionCardPayload {
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

export function createUserCompetitionCardCodec(domainTag: string): UserCompetitionCardCodec {
  const codec = createSignedTokenCodec<UserCompetitionCardPayload>(domainTag, isValidPayload)
  return {
    signBody: codec.signBody,
    sign(secret, payload, nowMs = Date.now()) {
      return codec.sign(secret, { ...payload, x: payload.x ?? Math.floor(nowMs / 1000) + SHARE_TTL_SECONDS })
    },
    verify(secret, token, nowMs = Date.now()) {
      const payload = codec.verify(secret, token)
      if (!payload) return null
      if (payload.x !== undefined && payload.x < Math.floor(nowMs / 1000)) return null
      return payload
    },
  }
}
