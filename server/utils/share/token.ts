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

// The signing/verify path (b64url, domain-separated HMAC, timing-safe compare,
// 512-char cap -> null on any tampering) lives in the shared codec; this module
// only pins the domain tag and the payload shape.
const codec = createSignedTokenCodec<ShareTokenPayload>('nostragoalus/share-card/v1', isValidPayload)

// Exposed so tests can forge an authentically-MACed token over a deliberately
// malformed body (to exercise the shape + JSON guards in verify).
export const signShareBody = codec.signBody
export const signShareToken = codec.sign
export const verifyShareToken = codec.verify
