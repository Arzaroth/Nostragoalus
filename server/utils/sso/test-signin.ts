import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { ssoProvider, verification } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'
import { openConfig } from './config'

// A real OIDC round-trip used as a dry-run claim preview: it captures the actual
// id_token/userinfo claims an IdP returns and maps them to our fields WITHOUT ever
// creating a user or session (it never touches better-auth's provisionUser). The
// request ticket and the captured result live in the verification table, keyed by
// a single-use 256-bit nonce with a short TTL, so nothing sensitive is persisted
// long-term and the public callback can be secured by the nonce alone.
const TICKET_PREFIX = '_sso-test-'
const RESULT_PREFIX = '_sso-test-result-'
const TEST_TTL_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10_000

export interface TestSignInStart {
  testId: string
  url: string
}

export interface CapturedClaims {
  rawClaims: Record<string, unknown>
  mapped: { email: string | null; name: string | null; image: string | null }
}

interface TestTicket {
  providerId: string
  adminUserId: string
  codeVerifier: string
  redirectUri: string
}

// The redirect URI the admin must register at the IdP for the test sign-in. It is
// distinct from the live callback so a test never collides with a real session.
export function testRedirectUri(origin: string): string {
  return `${origin}/api/sso/test-callback`
}

// Builds the OIDC authorization URL (PKCE S256) for a dry-run and stashes the
// matching single-use ticket. Test sign-in is OIDC-only; SAML uses the static
// bindings preview instead.
export async function startTestSignIn(
  db: AppDatabase,
  providerId: string,
  adminUserId: string,
  origin: string,
): Promise<TestSignInStart> {
  const rows = await db
    .select({ oidcConfig: ssoProvider.oidcConfig })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1)
  const provider = rows[0]
  if (!provider) throw new NotFoundError('provider not found')
  if (!provider.oidcConfig) throw new ValidationError('test sign-in is only available for OIDC providers')
  const config = openConfig(provider.oidcConfig)
  const authEndpoint = String(config.authorizationEndpoint ?? '')
  const clientId = String(config.clientId ?? '')
  if (!authEndpoint || !clientId) throw new ValidationError('provider is missing an authorization endpoint or client id')

  const testId = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const redirectUri = testRedirectUri(origin)
  const scopes = Array.isArray(config.scopes) && config.scopes.length ? config.scopes.map(String) : ['openid', 'email', 'profile']

  const url = new URL(authEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', testId)
  url.searchParams.set('nonce', randomBytes(16).toString('base64url'))
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  // Force a fresh authentication so the admin actually exercises the IdP login.
  url.searchParams.set('prompt', 'login')

  await db.insert(verification).values({
    id: randomUUID(),
    identifier: TICKET_PREFIX + testId,
    value: JSON.stringify({ providerId, adminUserId, codeVerifier, redirectUri } satisfies TestTicket),
    expiresAt: new Date(Date.now() + TEST_TTL_MS),
  })
  return { testId, url: url.toString() }
}

// Exchanges the authorization code, decodes the claims and stores the captured
// result for the admin to read back. Returns false (rather than throwing) when the
// nonce is unknown/expired so the public callback can't be probed for ticket
// existence. Never creates a user or session.
export async function completeOidcTestSignIn(db: AppDatabase, testId: string, code: string): Promise<boolean> {
  const ticket = await consumeTicket(db, testId)
  if (!ticket) return false
  const rows = await db
    .select({ oidcConfig: ssoProvider.oidcConfig })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, ticket.providerId))
    .limit(1)
  const oidcConfig = rows[0]?.oidcConfig
  if (!oidcConfig) return false
  const config = openConfig(oidcConfig)
  const tokens = await exchangeCode(config, code, ticket)
  const rawClaims = { ...decodeIdToken(tokens.id_token), ...(await fetchUserInfo(config, tokens.access_token)) }
  await storeResult(db, testId, { rawClaims, mapped: mapOidcClaims(rawClaims) })
  return true
}

// The captured claims for a finished test, or null if none/expired. Admin-gated at
// the route layer; the claims never ride the public callback's response.
export async function getTestSignInResult(db: AppDatabase, testId: string): Promise<CapturedClaims | null> {
  const rows = await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, RESULT_PREFIX + testId))
    .limit(1)
  const row = rows[0]
  if (!row || row.expiresAt <= new Date()) return null
  return JSON.parse(row.value) as CapturedClaims
}

async function consumeTicket(db: AppDatabase, testId: string): Promise<TestTicket | null> {
  const identifier = TICKET_PREFIX + testId
  const rows = await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1)
  // Single-use: drop the ticket whether or not it was still valid.
  await db.delete(verification).where(eq(verification.identifier, identifier))
  const row = rows[0]
  if (!row || row.expiresAt <= new Date()) return null
  return JSON.parse(row.value) as TestTicket
}

async function storeResult(db: AppDatabase, testId: string, claims: CapturedClaims): Promise<void> {
  const identifier = RESULT_PREFIX + testId
  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: JSON.stringify(claims),
    expiresAt: new Date(Date.now() + TEST_TTL_MS),
  })
}

async function exchangeCode(
  config: Record<string, unknown>,
  code: string,
  ticket: TestTicket,
): Promise<{ id_token?: string; access_token?: string }> {
  const res = await fetch(String(config.tokenEndpoint ?? ''), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ticket.redirectUri,
      client_id: String(config.clientId ?? ''),
      client_secret: String(config.clientSecret ?? ''),
      code_verifier: ticket.codeVerifier,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new ValidationError(`token endpoint returned HTTP ${res.status}`)
  return (await res.json()) as { id_token?: string; access_token?: string }
}

function decodeIdToken(idToken: string | undefined): Record<string, unknown> {
  const payload = idToken?.split('.')[1]
  if (!payload) return {}
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function fetchUserInfo(config: Record<string, unknown>, accessToken: string | undefined): Promise<Record<string, unknown>> {
  const endpoint = String(config.userInfoEndpoint ?? '')
  if (!endpoint || !accessToken) return {}
  try {
    const res = await fetch(endpoint, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return {}
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function mapOidcClaims(c: Record<string, unknown>): CapturedClaims['mapped'] {
  const email = str(c.email)
  const joined = [str(c.given_name), str(c.family_name)].filter(Boolean).join(' ') || null
  return { email, name: str(c.name) ?? joined ?? email, image: str(c.picture) }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}
