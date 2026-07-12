import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { ssoProvider, verification } from '../../../db/schema'
import type { SsoConnectionTestResult } from '#shared/types/sso'

vi.mock('node:dns/promises', () => ({ resolveTxt: vi.fn() }))
import { resolveTxt } from 'node:dns/promises'

process.env.NUXT_SSO_KEK = Buffer.alloc(32, 7).toString('base64')

const { sealConfig } = await import('./config')
const {
  setProviderStatus,
  testConnection,
  isProviderEnabled,
  scimProviderId,
  getDomainVerificationInstructions,
  verifyDomainDns,
  bypassDomainVerification,
} = await import('./service')

describe('scimProviderId', () => {
  it('derives a distinct SCIM id so it cannot collide with the SSO providerId', () => {
    expect(scimProviderId('acme')).toBe('acme-scim')
  })
})

// A throwaway self-signed cert (bare base64 body, no PEM headers) to exercise the
// header-wrapping branch of the certificate check.
const CERT_BODY =
  'MIIDBzCCAe+gAwIBAgIUFlch+AH8l1bt7up1skVu9G6UDf4wDQYJKoZIhvcNAQELBQAwEzERMA8GA1UEAwwIdGVzdC1pZHAwHhcNMjYwNjI5MjMwNzA1WhcNMzYwNjI2MjMwNzA1WjATMREwDwYDVQQDDAh0ZXN0LWlkcDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJHcbU3r/4PGxB7PsyufqzVcAKaPuUSH4HG/7Jx7q/dGrLpl8KvEdf29oz1FY4DY4E2LXXiPMKljXm4t+quKbHGzIwW6aZNIWTgTeqwv2jewFpJzZMCldQ/H8OmCZ1YH+d5tfVMRqKUutpdQ43nTPGeN8fDlSMKS83cAPWJeBaatE/OBqB2XLYw/KetK47BBQnvgoxYiQwx9Pj+TlAeLo2tT5RO7EF24IinoErCa3HxKuscHr5RwKOFakOQDL3HCIl7i6qlzTW5s4XnDEvNWyrSqfxL8Swh83GDGntuTIV+ussshEDSzUhqJYAEvF0Rg4pmAdUk2tt3Mr24RRpGDACECAwEAAaNTMFEwHQYDVR0OBBYEFEu3xHCOddRsyJ+e8DOQ0EalpCO5MB8GA1UdIwQYMBaAFEu3xHCOddRsyJ+e8DOQ0EalpCO5MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB9nJ7nEnbQGC9oZi+u9d3Q6O7MEOYP+gV5lPyJIsTbUh57VBI8oKSvemeLAFocAg9loMFjgj7AxquzP5wwTZpULrfc4+UqzCMOBpXvF6x/GaQ7GUbYzG4ZOsV40IpD9xm1m+zLZEUZFT8ZFueQvQzW6F84CFV1TcHIHfvRbW5X2balrvn5UzXIJKXqAHeF2Hoh+eQ5ONs+FrD+4LMfzekndbX1n0Yc8Aaf1IL7eqMfUxQCb+mSqxIIxfBm4puWJKZr1CU18vkAC+0V3T6fjuLJi16AYPZ27W5RafMiKw4JqYii8zVI4xZeftZlXHiHlv2n4xFEryIR7Ta7weWwR520='

const OK_RESULT: SsoConnectionTestResult = { ok: true, checkedAt: '2026-01-01T00:00:00.000Z', kind: 'oidc', checks: [] }

interface ProviderOverrides {
  providerId?: string
  domain?: string
  oidcConfig?: string | null
  samlConfig?: string | null
  status?: 'draft' | 'enabled' | 'disabled'
  domainVerified?: boolean
  lastTestResult?: SsoConnectionTestResult | null
}

async function insertProvider(db: TestDb, over: ProviderOverrides = {}): Promise<string> {
  const providerId = over.providerId ?? 'acme'
  await db.insert(ssoProvider).values({
    id: `sp-${providerId}`,
    issuer: 'https://idp.test',
    providerId,
    domain: over.domain ?? 'corp.test,corp.fr',
    oidcConfig: over.oidcConfig ?? null,
    samlConfig: over.samlConfig ?? null,
    status: over.status ?? 'draft',
    domainVerified: over.domainVerified ?? false,
    lastTestResult: over.lastTestResult ?? null,
  })
  return providerId
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('setProviderStatus', () => {
  let db: TestDb
  beforeEach(async () => {
    db = (await createTestDb()).db
  })

  it('throws when the provider does not exist', async () => {
    await expect(setProviderStatus(db, 'ghost', 'enabled')).rejects.toThrow(/not found/)
  })

  it('refuses to enable without a passing connection test', async () => {
    await insertProvider(db, { domainVerified: true, lastTestResult: null })
    await expect(setProviderStatus(db, 'acme', 'enabled')).rejects.toThrow(/connection test/)
  })

  it('refuses to enable when the domain is not verified', async () => {
    await insertProvider(db, { domainVerified: false, lastTestResult: OK_RESULT })
    await expect(setProviderStatus(db, 'acme', 'enabled')).rejects.toThrow(/verify the domain/)
  })

  it('enables when test passed and domain is verified', async () => {
    await insertProvider(db, { domainVerified: true, lastTestResult: OK_RESULT })
    await setProviderStatus(db, 'acme', 'enabled')
    const [row] = await db.select({ status: ssoProvider.status }).from(ssoProvider).where(eq(ssoProvider.providerId, 'acme'))
    expect(row!.status).toBe('enabled')
  })

  it('allows draft and disabled transitions without the enable gate', async () => {
    await insertProvider(db, { status: 'enabled', domainVerified: false, lastTestResult: null })
    await setProviderStatus(db, 'acme', 'disabled')
    await setProviderStatus(db, 'acme', 'draft')
    const [row] = await db.select({ status: ssoProvider.status }).from(ssoProvider).where(eq(ssoProvider.providerId, 'acme'))
    expect(row!.status).toBe('draft')
  })
})

describe('isProviderEnabled', () => {
  let db: TestDb
  beforeEach(async () => {
    db = (await createTestDb()).db
  })

  it('is true only for an enabled provider', async () => {
    await insertProvider(db, { providerId: 'live', status: 'enabled' })
    await insertProvider(db, { providerId: 'draft', status: 'draft' })
    expect(await isProviderEnabled(db, 'live')).toBe(true)
    expect(await isProviderEnabled(db, 'draft')).toBe(false)
    expect(await isProviderEnabled(db, 'ghost')).toBe(false)
  })
})

describe('testConnection', () => {
  let db: TestDb
  beforeEach(async () => {
    db = (await createTestDb()).db
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws when the provider does not exist', async () => {
    await expect(testConnection(db, 'ghost')).rejects.toThrow(/not found/)
  })

  it('passes a well-formed OIDC provider and persists the result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ keys: [{ kid: 'a' }] })))
    await insertProvider(db, {
      oidcConfig: sealConfig({
        clientId: 'cid',
        clientSecret: 'secret',
        authorizationEndpoint: 'https://idp.test/auth',
        tokenEndpoint: 'http://idp.test/token',
        jwksEndpoint: 'https://idp.test/jwks',
      }),
    })
    const result = await testConnection(db, 'acme')
    expect(result.ok).toBe(true)
    expect(result.kind).toBe('oidc')
    expect(result.checks.every((c) => c.ok)).toBe(true)
    const [row] = await db
      .select({ lastTestResult: ssoProvider.lastTestResult, lastTestedAt: ssoProvider.lastTestedAt })
      .from(ssoProvider)
      .where(eq(ssoProvider.providerId, 'acme'))
    expect(row!.lastTestResult?.ok).toBe(true)
    expect(row!.lastTestedAt).toBeInstanceOf(Date)
  })

  it('fails an OIDC provider with missing creds, bad endpoints and an unreachable JWKS', async () => {
    // A valid JWKS URL whose fetch rejects with a non-Error value exercises both
    // the reachability catch and the non-Error branch of the error formatter.
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'boom' }))
    await insertProvider(db, {
      oidcConfig: sealConfig({ clientId: '', authorizationEndpoint: 'ftp://idp.test/auth', tokenEndpoint: 'not-a-url', jwksEndpoint: 'https://idp.test/jwks' }),
    })
    const result = await testConnection(db, 'acme')
    expect(result.ok).toBe(false)
    expect(result.checks.find((c) => c.name === 'client credentials')!.ok).toBe(false)
    expect(result.checks.find((c) => c.name === 'authorization endpoint')!.ok).toBe(false)
    const jwks = result.checks.find((c) => c.name === 'JWKS endpoint')!
    expect(jwks.ok).toBe(false)
    expect(jwks.detail).toMatch(/unreachable: boom/)
  })

  it('fails an OIDC provider whose config is entirely empty', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await insertProvider(db, { oidcConfig: sealConfig({}) })
    const result = await testConnection(db, 'acme')
    expect(result.ok).toBe(false)
    expect(result.checks.every((c) => !c.ok)).toBe(true)
  })

  it('fails a SAML provider whose config is entirely empty', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await insertProvider(db, { samlConfig: sealConfig({ placeholder: true }) })
    const result = await testConnection(db, 'acme')
    expect(result.ok).toBe(false)
    expect(result.checks.find((c) => c.name === 'IdP certificate')!.detail).toMatch(/missing certificate/)
  })

  it('fails OIDC when the JWKS endpoint returns no keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ keys: [] })))
    await insertProvider(db, {
      oidcConfig: sealConfig({ clientId: 'c', clientSecret: 's', authorizationEndpoint: 'https://idp.test/a', tokenEndpoint: 'https://idp.test/t', jwksEndpoint: 'https://idp.test/jwks' }),
    })
    const result = await testConnection(db, 'acme')
    expect(result.checks.find((c) => c.name === 'JWKS endpoint')!.detail).toMatch(/no keys/)
    expect(result.ok).toBe(false)
  })

  it('fails OIDC when the JWKS endpoint returns a malformed body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ notKeys: 1 })))
    await insertProvider(db, {
      oidcConfig: sealConfig({ clientId: 'c', clientSecret: 's', authorizationEndpoint: 'https://idp.test/a', tokenEndpoint: 'https://idp.test/t', jwksEndpoint: 'https://idp.test/jwks' }),
    })
    const result = await testConnection(db, 'acme')
    expect(result.checks.find((c) => c.name === 'JWKS endpoint')!.ok).toBe(false)
  })

  it('fails OIDC when the JWKS endpoint returns a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)))
    await insertProvider(db, {
      oidcConfig: sealConfig({ clientId: 'c', clientSecret: 's', authorizationEndpoint: 'https://idp.test/a', tokenEndpoint: 'https://idp.test/t', jwksEndpoint: 'https://idp.test/jwks' }),
    })
    const result = await testConnection(db, 'acme')
    expect(result.checks.find((c) => c.name === 'JWKS endpoint')!.detail).toMatch(/HTTP 500/)
  })

  it('passes a well-formed SAML provider (bare-base64 cert, reachable IdP)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 405 })))
    await insertProvider(db, {
      samlConfig: sealConfig({ entryPoint: 'https://idp.test/saml/sso', cert: CERT_BODY }),
    })
    const result = await testConnection(db, 'acme')
    expect(result.kind).toBe('saml')
    expect(result.ok).toBe(true)
    expect(result.checks.find((c) => c.name === 'IdP certificate')!.ok).toBe(true)
  })

  it('passes a SAML cert already wrapped in PEM headers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })))
    const pem = `-----BEGIN CERTIFICATE-----\n${CERT_BODY}\n-----END CERTIFICATE-----`
    await insertProvider(db, { samlConfig: sealConfig({ entryPoint: 'https://idp.test/saml', cert: pem }) })
    const result = await testConnection(db, 'acme')
    expect(result.checks.find((c) => c.name === 'IdP certificate')!.ok).toBe(true)
  })

  it('fails SAML with a missing entry point and a bad cert', async () => {
    // Empty entry point -> the reachability check short-circuits before any fetch.
    vi.stubGlobal('fetch', vi.fn())
    await insertProvider(db, { samlConfig: sealConfig({ entryPoint: '', cert: 'not-a-cert' }) })
    const result = await testConnection(db, 'acme')
    expect(result.ok).toBe(false)
    expect(result.checks.find((c) => c.name === 'SSO entry point')!.ok).toBe(false)
    expect(result.checks.find((c) => c.name === 'IdP certificate')!.ok).toBe(false)
    expect(result.checks.find((c) => c.name === 'reachability')!.ok).toBe(false)
  })

  it('fails SAML when the IdP endpoint is configured but unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ETIMEDOUT') }))
    await insertProvider(db, { samlConfig: sealConfig({ entryPoint: 'https://idp.test/saml/sso', cert: CERT_BODY }) })
    const result = await testConnection(db, 'acme')
    expect(result.ok).toBe(false)
    const reach = result.checks.find((c) => c.name === 'reachability')!
    expect(reach.ok).toBe(false)
    expect(reach.detail).toMatch(/unreachable: ETIMEDOUT/)
  })
})

describe('domain verification', () => {
  let db: TestDb
  const resolveTxtMock = vi.mocked(resolveTxt)
  beforeEach(async () => {
    db = (await createTestDb()).db
    resolveTxtMock.mockReset()
  })

  it('throws for an unknown provider', async () => {
    await expect(getDomainVerificationInstructions(db, 'ghost')).rejects.toThrow(/not found/)
    await expect(verifyDomainDns(db, 'ghost')).rejects.toThrow(/not found/)
    await expect(bypassDomainVerification(db, 'ghost')).rejects.toThrow(/not found/)
  })

  it('issues instructions for the first configured domain and reuses an active token', async () => {
    await insertProvider(db, { domain: 'corp.test,corp.fr' })
    const first = await getDomainVerificationInstructions(db, 'acme')
    expect(first.host).toBe('_better-auth-token-acme.corp.test')
    expect(first.value).toBe(`_better-auth-token-acme=${first.value.split('=')[1]}`)
    expect(first.verified).toBe(false)
    const second = await getDomainVerificationInstructions(db, 'acme')
    expect(second.value).toBe(first.value)
  })

  it('mints a fresh token when the previous one has expired', async () => {
    await insertProvider(db)
    const first = await getDomainVerificationInstructions(db, 'acme')
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, '_better-auth-token-acme'))
    const second = await getDomainVerificationInstructions(db, 'acme')
    expect(second.value).not.toBe(first.value)
  })

  it('verifies when the TXT record matches and flips domainVerified', async () => {
    await insertProvider(db)
    const { host, value } = await getDomainVerificationInstructions(db, 'acme')
    resolveTxtMock.mockResolvedValue([[value]])
    const result = await verifyDomainDns(db, 'acme')
    expect(result.ok).toBe(true)
    expect(result.host).toBe(host)
    expect(resolveTxtMock).toHaveBeenCalledWith(host)
    const [row] = await db.select({ v: ssoProvider.domainVerified }).from(ssoProvider).where(eq(ssoProvider.providerId, 'acme'))
    expect(row!.v).toBe(true)
  })

  it('does not verify when the TXT record is absent or wrong', async () => {
    await insertProvider(db)
    await getDomainVerificationInstructions(db, 'acme')
    resolveTxtMock.mockResolvedValue([['some-other-value']])
    expect((await verifyDomainDns(db, 'acme')).ok).toBe(false)
    resolveTxtMock.mockRejectedValue(new Error('ENOTFOUND'))
    expect((await verifyDomainDns(db, 'acme')).ok).toBe(false)
  })

  it('returns not-ok when no verification token has been requested yet', async () => {
    await insertProvider(db)
    const result = await verifyDomainDns(db, 'acme')
    expect(result.ok).toBe(false)
    expect(result.expected).toBe('')
    expect(resolveTxtMock).not.toHaveBeenCalled()
  })

  it('bypass marks the domain verified directly', async () => {
    await insertProvider(db, { domainVerified: false })
    await bypassDomainVerification(db, 'acme')
    const [row] = await db.select({ v: ssoProvider.domainVerified }).from(ssoProvider).where(eq(ssoProvider.providerId, 'acme'))
    expect(row!.v).toBe(true)
  })
})
