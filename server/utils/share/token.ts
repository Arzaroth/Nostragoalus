import { createSignedTokenCodec } from '../signed-token/codec'

// A share token is a stateless, signed capability: it names a prediction, the
// card mode, and the locale to render. No DB row - the HMAC over the app secret
// is what makes it unforgeable, so a third party can't craft a token to unseal
// someone else's pre-kickoff pick. Minting (which checks ownership) is the only
// place a valid token is produced; this module just signs and verifies.

export const SHARE_MODES = ['result', 'sealed', 'reveal'] as const
export type ShareMode = (typeof SHARE_MODES)[number]

export const SHARE_LOCALES = ['en', 'fr', 'th', 'tlh', 'ar'] as const
export type ShareLocale = (typeof SHARE_LOCALES)[number]

// A minted share token lives this long. Bounds the otherwise-permanent capability
// so a leaked link stops unsealing a pick after a while; generous because a shared
// card is a social post that may be viewed weeks later.
export const SHARE_TTL_SECONDS = 60 * 60 * 24 * 180 // 180 days

export interface ShareTokenPayload {
  // prediction id
  p: string
  // mode
  m: ShareMode
  // locale
  l: ShareLocale
  // expiry, unix seconds (optional: tokens minted before expiry existed omit it
  // and remain valid - a share card is low-risk self-shared content)
  x?: number
  // payload version, so the format can evolve without honouring stale tokens
  v: 1
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
    (SHARE_LOCALES as readonly string[]).includes(p.l) &&
    (p.x === undefined || (typeof p.x === 'number' && Number.isFinite(p.x)))
  )
}

// The signing/verify path (b64url, domain-separated HMAC, timing-safe compare,
// 512-char cap -> null on any tampering) lives in the shared codec; this module
// pins the domain tag, the payload shape, and the expiry policy.
const codec = createSignedTokenCodec<ShareTokenPayload>('nostragoalus/share-card/v1', isValidPayload)

// Exposed so tests can forge an authentically-MACed token over a deliberately
// malformed body (to exercise the shape + JSON guards in verify).
export const signShareBody = codec.signBody

// Mint a token stamped with an expiry TTL_SECONDS from now.
export function signShareToken(secret: string, payload: ShareTokenPayload, nowMs: number = Date.now()): string {
  return codec.sign(secret, { ...payload, x: payload.x ?? Math.floor(nowMs / 1000) + SHARE_TTL_SECONDS })
}

// Verify, then reject an expired token (a token with no expiry never expires).
export function verifyShareToken(secret: string, token: string | undefined, nowMs: number = Date.now()): ShareTokenPayload | null {
  const payload = codec.verify(secret, token)
  if (!payload) return null
  if (payload.x !== undefined && payload.x < Math.floor(nowMs / 1000)) return null
  return payload
}
