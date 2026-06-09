import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import { createTestDb, type TestDb } from './db'
import * as schema from '../db/schema'

// Drives the full OIDC SSO flow (sign-in -> IdP redirect -> callback) against the
// production auth options, with the IdP's token/userinfo endpoints mocked at the
// fetch layer. Verifies the account-linking policy: an SSO sign-in whose email
// matches an existing local (email+password) account links to it instead of
// failing with account_not_linked or creating a duplicate user.

const BASE = 'http://app.test'
const IDP = 'https://idp.test'

process.env.NUXT_SSO_KEK = Buffer.alloc(32, 7).toString('base64')
process.env.BETTER_AUTH_SECRET = 'test-secret-for-sso-linking-tests'
process.env.BETTER_AUTH_URL = BASE

const idpUsers: Record<string, { sub: string; email: string; name: string }> = {}
let lastTokenFor = ''

function mockFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes('pwnedpasswords.com')) {
    return Promise.resolve(new Response('AAAAA1111111111111111111111111111111:1'))
  }
  if (url.startsWith(`${IDP}/token`)) {
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: 'at-test', token_type: 'Bearer', expires_in: 3600 }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  if (url.startsWith(`${IDP}/userinfo`)) {
    const u = idpUsers[lastTokenFor]
    return Promise.resolve(
      new Response(JSON.stringify({ sub: u.sub, email: u.email, email_verified: true, name: u.name }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  return Promise.reject(new Error(`unexpected fetch in test: ${url}`))
}

describe('SSO account linking', () => {
  let db: TestDb
  let auth: ReturnType<typeof betterAuth>

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(mockFetch))
    const t = await createTestDb()
    db = t.db
    const { buildAuthOptions } = await import('../lib/auth')
    auth = betterAuth(buildAuthOptions(db))
    await db.insert(schema.ssoProvider).values({
      id: 'sp-test-1',
      issuer: IDP,
      providerId: 'acme',
      domain: 'corp.test',
      oidcConfig: JSON.stringify({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        authorizationEndpoint: `${IDP}/auth`,
        tokenEndpoint: `${IDP}/token`,
        userInfoEndpoint: `${IDP}/userinfo`,
        jwksEndpoint: `${IDP}/jwks`,
        scopes: ['openid', 'email', 'profile'],
        pkce: true,
      }),
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  async function ssoSignIn(email: string): Promise<Response> {
    lastTokenFor = email
    const signIn = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/sso`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, callbackURL: '/matches' }),
      }),
    )
    expect(signIn.status).toBe(200)
    const { url } = (await signIn.json()) as { url: string }
    const state = new URL(url).searchParams.get('state')
    expect(state).toBeTruthy()
    const cookies = signIn.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    return auth.handler(
      new Request(`${BASE}/api/auth/sso/callback/acme?code=fake-code&state=${state}`, {
        headers: { cookie: cookies },
      }),
    )
  }

  it('links an SSO sign-in to an existing local account with the same email', async () => {
    const email = 'alice@corp.test'
    idpUsers[email] = { sub: 'idp-alice', email, name: 'Alice' }
    const signUp = await auth.api.signUpEmail({
      body: { email, password: 'tr0ubadour-horse-staple!', name: 'Alice' },
    })
    const localUserId = signUp.user.id

    const cb = await ssoSignIn(email)
    expect(cb.status).toBe(302)
    const location = cb.headers.get('location') ?? ''
    expect(location).not.toContain('error')
    expect(location).toContain('/matches')

    const users = await db.select().from(schema.user).where(eq(schema.user.email, email))
    expect(users).toHaveLength(1)
    expect(users[0].id).toBe(localUserId)

    const accounts = await db.select().from(schema.account).where(eq(schema.account.userId, localUserId))
    const providers = accounts.map((a) => a.providerId).sort()
    expect(providers).toEqual(['acme', 'credential'])
  })

  it('creates a fresh user for an SSO sign-in with an unknown email', async () => {
    const email = 'bob@corp.test'
    idpUsers[email] = { sub: 'idp-bob', email, name: 'Bob' }

    const cb = await ssoSignIn(email)
    expect(cb.status).toBe(302)
    expect(cb.headers.get('location') ?? '').not.toContain('error')

    const users = await db.select().from(schema.user).where(eq(schema.user.email, email))
    expect(users).toHaveLength(1)
    const accounts = await db.select().from(schema.account).where(eq(schema.account.userId, users[0].id))
    expect(accounts.map((a) => a.providerId)).toEqual(['acme'])
  })
})
