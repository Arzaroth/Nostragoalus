import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { ssoProvider, verification, user, session } from '../../../db/schema'

process.env.NUXT_SSO_KEK = Buffer.alloc(32, 7).toString('base64')

const { sealConfig } = await import('./config')
const { startTestSignIn, completeOidcTestSignIn, getTestSignInResult, testRedirectUri } = await import('./test-signin')

const OIDC_CONFIG = {
  clientId: 'cid',
  clientSecret: 'secret',
  authorizationEndpoint: 'https://idp.test/auth',
  tokenEndpoint: 'https://idp.test/token',
  userInfoEndpoint: 'https://idp.test/userinfo',
  scopes: ['openid', 'email', 'profile'],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function idToken(claims: Record<string, unknown>): string {
  return `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`
}

async function insertOidc(db: TestDb, over: { providerId?: string; oidcConfig?: string | null; samlConfig?: string | null } = {}): Promise<string> {
  const providerId = over.providerId ?? 'acme'
  await db.insert(ssoProvider).values({
    id: `sp-${providerId}`,
    issuer: 'https://idp.test',
    providerId,
    domain: 'corp.test',
    oidcConfig: 'oidcConfig' in over ? over.oidcConfig! : sealConfig(OIDC_CONFIG),
    samlConfig: over.samlConfig ?? null,
    status: 'draft',
    domainVerified: false,
  })
  return providerId
}

function mockIdpFetch(idClaims: Record<string, unknown>, userinfo: Record<string, unknown> | null, tokenStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/token')) return jsonResponse({ id_token: idToken(idClaims), access_token: 'at' }, tokenStatus)
      if (url.includes('/userinfo')) return jsonResponse(userinfo ?? {})
      throw new Error(`unexpected fetch: ${url}`)
    }),
  )
}

describe('startTestSignIn', () => {
  let db: TestDb
  beforeEach(async () => {
    db = (await createTestDb()).db
  })

  it('throws for an unknown provider', async () => {
    await expect(startTestSignIn(db, 'ghost', 'admin', 'https://app.test')).rejects.toThrow(/not found/)
  })

  it('rejects a SAML provider (OIDC only)', async () => {
    await insertOidc(db, { oidcConfig: null, samlConfig: sealConfig({ entryPoint: 'https://idp.test/saml' }) })
    await expect(startTestSignIn(db, 'acme', 'admin', 'https://app.test')).rejects.toThrow(/only available for OIDC/)
  })

  it('rejects an OIDC provider missing its authorization endpoint or client id', async () => {
    await insertOidc(db, { oidcConfig: sealConfig({ clientId: 'c' }) })
    await expect(startTestSignIn(db, 'acme', 'admin', 'https://app.test')).rejects.toThrow(/authorization endpoint or client id/)
    await db.delete(ssoProvider).where(eq(ssoProvider.providerId, 'acme'))
    await insertOidc(db, { oidcConfig: sealConfig({ authorizationEndpoint: 'https://idp.test/auth' }) })
    await expect(startTestSignIn(db, 'acme', 'admin', 'https://app.test')).rejects.toThrow(/authorization endpoint or client id/)
  })

  it('defaults the scopes when the provider config omits them', async () => {
    await insertOidc(db, { oidcConfig: sealConfig({ authorizationEndpoint: 'https://idp.test/auth', clientId: 'cid' }) })
    const { url } = await startTestSignIn(db, 'acme', 'admin', 'https://app.test')
    expect(new URL(url).searchParams.get('scope')).toBe('openid email profile')
  })

  it('builds a PKCE authorization URL and stores a ticket', async () => {
    await insertOidc(db)
    const { testId, url } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://idp.test/auth')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe('cid')
    expect(parsed.searchParams.get('redirect_uri')).toBe(testRedirectUri('https://app.test'))
    expect(parsed.searchParams.get('state')).toBe(testId)
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy()
    const [ticket] = await db.select().from(verification).where(eq(verification.identifier, `_sso-test-${testId}`))
    expect(ticket).toBeTruthy()
  })
})

describe('completeOidcTestSignIn', () => {
  let db: TestDb
  beforeEach(async () => {
    db = (await createTestDb()).db
  })
  afterEach(() => vi.unstubAllGlobals())

  it('captures and maps claims without creating a user or session', async () => {
    await insertOidc(db)
    const { testId } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    mockIdpFetch({ sub: 'idp-1', email: 'alice@corp.test', name: 'Alice Smith' }, { picture: 'https://idp.test/a.png' })
    expect(await completeOidcTestSignIn(db, testId, 'auth-code')).toBe(true)

    const result = await getTestSignInResult(db, testId)
    expect(result?.mapped).toEqual({ email: 'alice@corp.test', name: 'Alice Smith', image: 'https://idp.test/a.png' })
    expect(result?.rawClaims.sub).toBe('idp-1')
    // The dry-run must never provision anything.
    expect(await db.select().from(user)).toHaveLength(0)
    expect(await db.select().from(session)).toHaveLength(0)
  })

  it('is single-use: a second completion of the same nonce fails', async () => {
    await insertOidc(db)
    const { testId } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    mockIdpFetch({ email: 'a@corp.test' }, null)
    expect(await completeOidcTestSignIn(db, testId, 'code')).toBe(true)
    expect(await completeOidcTestSignIn(db, testId, 'code')).toBe(false)
  })

  it('returns false for an unknown nonce and stores nothing', async () => {
    mockIdpFetch({}, null)
    expect(await completeOidcTestSignIn(db, 'nope', 'code')).toBe(false)
    expect(await getTestSignInResult(db, 'nope')).toBeNull()
  })

  it('derives the name from given/family when no name claim is present', async () => {
    await insertOidc(db)
    const { testId } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    mockIdpFetch({ given_name: 'Bob', family_name: 'Jones' }, {})
    await completeOidcTestSignIn(db, testId, 'code')
    expect((await getTestSignInResult(db, testId))?.mapped).toEqual({ email: null, name: 'Bob Jones', image: null })
  })

  it('falls back to the email as the name when no name parts exist', async () => {
    await insertOidc(db)
    const { testId } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    mockIdpFetch({ email: 'solo@corp.test' }, {})
    await completeOidcTestSignIn(db, testId, 'code')
    expect((await getTestSignInResult(db, testId))?.mapped).toEqual({ email: 'solo@corp.test', name: 'solo@corp.test', image: null })
  })

  it('throws when the token endpoint rejects the exchange', async () => {
    await insertOidc(db)
    const { testId } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    mockIdpFetch({}, null, 400)
    await expect(completeOidcTestSignIn(db, testId, 'bad-code')).rejects.toThrow(/token endpoint returned HTTP 400/)
  })

  it('tolerates an unreachable userinfo endpoint and an undecodable id_token', async () => {
    await insertOidc(db)
    const { testId } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    // A present-but-non-JSON payload exercises the id_token decode catch.
    const badIdToken = `h.${Buffer.from('not json').toString('base64url')}.s`
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url.includes('/token')) return jsonResponse({ id_token: badIdToken, access_token: 'at' })
        throw new Error('userinfo down')
      }),
    )
    expect(await completeOidcTestSignIn(db, testId, 'code')).toBe(true)
    expect((await getTestSignInResult(db, testId))?.mapped).toEqual({ email: null, name: null, image: null })
  })

  it('maps from userinfo when the token response carries no id_token', async () => {
    await insertOidc(db)
    const { testId } = await startTestSignIn(db, 'acme', 'admin-1', 'https://app.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url.includes('/token')) return jsonResponse({ access_token: 'at' })
        if (url.includes('/userinfo')) return jsonResponse({ email: 'u@corp.test', name: 'User', picture: 'p.png' })
        throw new Error(`unexpected ${url}`)
      }),
    )
    await completeOidcTestSignIn(db, testId, 'code')
    expect((await getTestSignInResult(db, testId))?.mapped).toEqual({ email: 'u@corp.test', name: 'User', image: 'p.png' })
  })
})
