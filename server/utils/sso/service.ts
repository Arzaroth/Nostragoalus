import { eq } from 'drizzle-orm'
import { X509Certificate, randomBytes, randomUUID } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import type { SsoConnectionCheck, SsoConnectionTestResult, SsoProviderStatus } from '#shared/types/sso'
import type { AppDatabase } from '../../../db/types'
import { ssoProvider, verification } from '../../../db/schema'
import { NotFoundError, SsoNotReadyError } from '../errors'
import { openConfig } from './config'

const REQUEST_TIMEOUT_MS = 10_000
// Mirrors @better-auth/sso's getVerificationIdentifier (default tokenPrefix), so
// the DNS-TXT record we hand-roll here matches the format the plugin documents.
const DOMAIN_TOKEN_PREFIX = 'better-auth-token'
const DOMAIN_TOKEN_TTL_MS = 7 * 24 * 3600 * 1000

// ---- Lifecycle ------------------------------------------------------------

// Move a provider between draft/enabled/disabled. Enabling is gated: the last
// connection test must have passed and the domain must be verified (or bypassed).
// draft/disabled are always allowed (disabling never revokes live sessions).
export async function setProviderStatus(db: AppDatabase, providerId: string, next: SsoProviderStatus): Promise<void> {
  const rows = await db
    .select({ domainVerified: ssoProvider.domainVerified, lastTestResult: ssoProvider.lastTestResult })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1)
  const provider = rows[0]
  if (!provider) throw new NotFoundError('provider not found')
  if (next === 'enabled') {
    if (!provider.lastTestResult?.ok) throw new SsoNotReadyError('run a passing connection test before enabling this provider')
    if (!provider.domainVerified) throw new SsoNotReadyError('verify the domain (or bypass) before enabling this provider')
  }
  await db.update(ssoProvider).set({ status: next }).where(eq(ssoProvider.providerId, providerId))
}

// True only when the provider is live ('enabled'). The catch-all uses this to
// reject sign-in callbacks for draft/disabled providers (existing sessions are
// untouched - the gate only sits on the session-minting callback paths).
export async function isProviderEnabled(db: AppDatabase, providerId: string): Promise<boolean> {
  const rows = await db
    .select({ status: ssoProvider.status })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1)
  return rows[0]?.status === 'enabled'
}

// ---- Connection test ------------------------------------------------------

// Runs automated pre-flight checks and persists the outcome. This is the gate to
// leave draft: setProviderStatus(...'enabled') refuses until the stored result is ok.
export async function testConnection(db: AppDatabase, providerId: string): Promise<SsoConnectionTestResult> {
  const rows = await db
    .select({ oidcConfig: ssoProvider.oidcConfig, samlConfig: ssoProvider.samlConfig })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1)
  const provider = rows[0]
  if (!provider) throw new NotFoundError('provider not found')
  const result = provider.samlConfig
    ? await testSamlConnection(openConfig(provider.samlConfig))
    : await testOidcConnection(openConfig(provider.oidcConfig))
  await db
    .update(ssoProvider)
    .set({ lastTestedAt: new Date(), lastTestResult: result })
    .where(eq(ssoProvider.providerId, providerId))
  return result
}

async function testOidcConnection(config: Record<string, unknown>): Promise<SsoConnectionTestResult> {
  const checks: SsoConnectionCheck[] = []
  const clientId = String(config.clientId ?? '')
  const clientSecret = String(config.clientSecret ?? '')
  checks.push({
    name: 'client credentials',
    ok: Boolean(clientId && clientSecret),
    detail: clientId && clientSecret ? 'client id and secret are set' : 'client id and secret are required',
  })
  checks.push(endpointCheck('authorization endpoint', String(config.authorizationEndpoint ?? '')))
  checks.push(endpointCheck('token endpoint', String(config.tokenEndpoint ?? '')))
  checks.push(await checkJwks(String(config.jwksEndpoint ?? '')))
  return finalize('oidc', checks)
}

async function testSamlConnection(config: Record<string, unknown>): Promise<SsoConnectionTestResult> {
  const entryPoint = parseHttpUrl(String(config.entryPoint ?? ''))
  const checks: SsoConnectionCheck[] = [
    {
      name: 'SSO entry point',
      ok: Boolean(entryPoint),
      detail: entryPoint ? `${entryPoint.origin}${entryPoint.pathname}` : 'missing or invalid entry point URL',
    },
    checkCertificate(String(config.cert ?? '')),
    await checkReachable(entryPoint, 'IdP SSO endpoint'),
  ]
  return finalize('saml', checks)
}

function endpointCheck(name: string, value: string): SsoConnectionCheck {
  const url = parseHttpUrl(value)
  return { name, ok: Boolean(url), detail: url ? `${url.origin}${url.pathname}` : `missing or invalid ${name}` }
}

async function checkJwks(endpoint: string): Promise<SsoConnectionCheck> {
  const url = parseHttpUrl(endpoint)
  if (!url) return { name: 'JWKS endpoint', ok: false, detail: 'missing or invalid JWKS endpoint' }
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!res.ok) return { name: 'JWKS endpoint', ok: false, detail: `JWKS endpoint returned HTTP ${res.status}` }
    const doc = (await res.json()) as { keys?: unknown[] }
    const count = Array.isArray(doc.keys) ? doc.keys.length : 0
    return {
      name: 'JWKS endpoint',
      ok: count > 0,
      detail: count > 0 ? `${count} signing key(s) published` : 'JWKS endpoint published no keys',
    }
  } catch (err) {
    return { name: 'JWKS endpoint', ok: false, detail: `JWKS endpoint unreachable: ${errorMessage(err)}` }
  }
}

async function checkReachable(url: URL | null, label: string): Promise<SsoConnectionCheck> {
  if (!url) return { name: 'reachability', ok: false, detail: `no ${label} to reach` }
  try {
    // A SAML SSO endpoint expects a SAMLRequest, so any HTTP status means it
    // answered: only a transport error counts as unreachable.
    await fetch(url.toString(), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    return { name: 'reachability', ok: true, detail: `${label} responded` }
  } catch (err) {
    return { name: 'reachability', ok: false, detail: `${label} unreachable: ${errorMessage(err)}` }
  }
}

function checkCertificate(cert: string): SsoConnectionCheck {
  const trimmed = cert.trim()
  if (!trimmed) return { name: 'IdP certificate', ok: false, detail: 'missing certificate' }
  // SAML metadata often ships the bare base64 body; wrap it so X509Certificate
  // can parse either form.
  const pem = trimmed.includes('BEGIN CERTIFICATE')
    ? trimmed
    : `-----BEGIN CERTIFICATE-----\n${trimmed}\n-----END CERTIFICATE-----`
  try {
    const x509 = new X509Certificate(pem)
    return { name: 'IdP certificate', ok: true, detail: `valid X.509, expires ${x509.validTo}` }
  } catch {
    return { name: 'IdP certificate', ok: false, detail: 'not a valid X.509 certificate' }
  }
}

function finalize(kind: 'oidc' | 'saml', checks: SsoConnectionCheck[]): SsoConnectionTestResult {
  return { ok: checks.every((c) => c.ok), checkedAt: new Date().toISOString(), kind, checks }
}

// ---- Domain verification --------------------------------------------------

export interface DomainVerificationInstructions {
  host: string
  value: string
  verified: boolean
}

export interface DomainVerificationCheck {
  ok: boolean
  host: string
  expected: string
  found: string[]
}

// Returns the DNS-TXT record the admin must publish on the first configured
// domain. Reuses an active token or mints a fresh 7-day one in the verification
// table - the same identifier/value shape @better-auth/sso uses.
export async function getDomainVerificationInstructions(
  db: AppDatabase,
  providerId: string,
): Promise<DomainVerificationInstructions> {
  const provider = await loadDomain(db, providerId)
  const identifier = verificationIdentifier(providerId)
  const token = await activeOrNewToken(db, identifier)
  return {
    host: `${identifier}.${firstDomain(provider.domain)}`,
    value: `${identifier}=${token}`,
    verified: provider.domainVerified,
  }
}

// Resolves the TXT record and, on a match, marks the provider domain-verified.
// Hand-rolled rather than calling auth.api.verifyDomain so it isn't gated by the
// plugin's "you must be the registering admin" owner check (multi-admin safe).
export async function verifyDomainDns(db: AppDatabase, providerId: string): Promise<DomainVerificationCheck> {
  const provider = await loadDomain(db, providerId)
  const identifier = verificationIdentifier(providerId)
  const host = `${identifier}.${firstDomain(provider.domain)}`
  const token = await activeToken(db, identifier)
  if (!token) return { ok: false, host, expected: '', found: [] }
  const expected = `${identifier}=${token}`
  let found: string[] = []
  try {
    found = (await resolveTxt(host)).flat()
  } catch {
    // NXDOMAIN / record not published yet: not an error, just still unverified.
  }
  const ok = found.some((record) => record.includes(expected))
  if (ok) await db.update(ssoProvider).set({ domainVerified: true }).where(eq(ssoProvider.providerId, providerId))
  return { ok, host, expected, found }
}

// Admin escape hatch: mark the domain verified without the DNS proof. Safe in the
// single-tenant model where the admin who registers a provider is already trusted.
export async function bypassDomainVerification(db: AppDatabase, providerId: string): Promise<void> {
  const updated = await db
    .update(ssoProvider)
    .set({ domainVerified: true })
    .where(eq(ssoProvider.providerId, providerId))
    .returning({ providerId: ssoProvider.providerId })
  if (updated.length === 0) throw new NotFoundError('provider not found')
}

async function loadDomain(db: AppDatabase, providerId: string): Promise<{ domain: string; domainVerified: boolean }> {
  const rows = await db
    .select({ domain: ssoProvider.domain, domainVerified: ssoProvider.domainVerified })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1)
  const provider = rows[0]
  if (!provider) throw new NotFoundError('provider not found')
  return provider
}

function verificationIdentifier(providerId: string): string {
  return `_${DOMAIN_TOKEN_PREFIX}-${providerId}`
}

function firstDomain(csv: string): string {
  return csv.split(',')[0]!.trim().toLowerCase()
}

async function activeToken(db: AppDatabase, identifier: string): Promise<string | null> {
  const rows = await db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1)
  const row = rows[0]
  return row && row.expiresAt > new Date() ? row.value : null
}

async function activeOrNewToken(db: AppDatabase, identifier: string): Promise<string> {
  const existing = await activeToken(db, identifier)
  if (existing) return existing
  const token = randomBytes(18).toString('base64url')
  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({
    id: randomUUID(),
    identifier,
    value: token,
    expiresAt: new Date(Date.now() + DOMAIN_TOKEN_TTL_MS),
  })
  return token
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
