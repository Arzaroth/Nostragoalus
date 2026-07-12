import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import { createTestDb, type TestDb } from './db'
import * as schema from '../db/schema'

// Drives the SCIM plugin end to end against the production auth options on pglite:
// mint a token (admin path), provision a user over /scim/v2/Users, deprovision it
// (active:false -> admin ban) keeping its data, then reactivate. Proves our wiring
// (schema, hashed token, the catch-all block) and the deprovision semantics the
// product cares about, without the dockerized e2e stack.

const BASE = 'http://app.test'
process.env.NUXT_SSO_KEK = Buffer.alloc(32, 7).toString('base64')
process.env.BETTER_AUTH_SECRET = 'test-secret-for-scim-tests'
process.env.BETTER_AUTH_URL = BASE

function mockFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input)
  // The HIBP breach check runs on sign-up; everything else is local.
  if (url.includes('pwnedpasswords.com')) return Promise.resolve(new Response('AAAAA1111111111111111111111111111111:0'))
  return Promise.reject(new Error(`unexpected fetch in test: ${url}`))
}

describe('SCIM provisioning', () => {
  let db: TestDb
  let auth: ReturnType<typeof betterAuth>
  let scimToken: string

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(mockFetch))
    db = (await createTestDb()).db
    const { buildAuthOptions } = await import('../lib/auth')
    auth = betterAuth(buildAuthOptions(db))
    // A signed-in session is all generateSCIMToken needs for a per-provider token.
    const signUp = await auth.api.signUpEmail({
      body: { email: 'admin@corp.test', password: 'tr0ubadour-horse-staple!', name: 'Admin' },
      asResponse: true,
    })
    const cookies = signUp.headers.getSetCookie().join('; ')
    const token = await auth.api.generateSCIMToken({ body: { providerId: 'kc' }, headers: { cookie: cookies } })
    scimToken = token.scimToken
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  async function scim(method: string, path: string, body?: unknown, token = scimToken): Promise<Response> {
    return auth.handler(
      new Request(`${BASE}/api/auth/scim/v2${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/scim+json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    )
  }

  it('stores only the hash of the bearer token', async () => {
    const rows = await db.select().from(schema.scimProvider).where(eq(schema.scimProvider.providerId, 'kc'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.scimToken).not.toBe(scimToken)
    expect(scimToken.length).toBeGreaterThan(10)
  })

  it('provisions a user and updates it through the data plane', async () => {
    const create = await scim('POST', '/Users', {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'scimuser@corp.test',
      externalId: 'ext-1',
      name: { givenName: 'SCIM', familyName: 'User' },
      emails: [{ value: 'scimuser@corp.test', primary: true }],
      active: true,
    })
    expect(create.status).toBeLessThan(300)
    const userId = ((await create.json()) as { id: string }).id
    expect(userId).toBeTruthy()

    let user = (await db.select().from(schema.user).where(eq(schema.user.id, userId)))[0]
    expect(user!.email).toBe('scimuser@corp.test')
    // The IdP provisioned an account row tied to this SCIM token's provider.
    expect(await db.select().from(schema.account).where(eq(schema.account.userId, userId))).not.toHaveLength(0)

    // A PATCH against a mapped attribute (userName -> email) updates the user.
    const patch = await scim('PATCH', `/Users/${userId}`, {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', path: 'userName', value: 'moved@corp.test' }],
    })
    expect(patch.status).toBeLessThan(300)
    user = (await db.select().from(schema.user).where(eq(schema.user.id, userId)))[0]
    expect(user!.email).toBe('moved@corp.test')
  })

  it('deprovisions on active:false (ban, data kept) and reactivates on active:true', async () => {
    const create = await scim('POST', '/Users', {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'deact@corp.test',
      emails: [{ value: 'deact@corp.test', primary: true }],
      active: true,
    })
    const userId = ((await create.json()) as { id: string }).id

    // Deactivate: maps to the admin plugin's ban (and revokes sessions).
    const off = await scim('PATCH', `/Users/${userId}`, {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', path: 'active', value: false }],
    })
    expect(off.status).toBeLessThan(300)
    let user = (await db.select().from(schema.user).where(eq(schema.user.id, userId)))[0]
    expect(user!.banned).toBe(true)
    // A ban, not a delete: the user and its account survive.
    expect(await db.select().from(schema.user).where(eq(schema.user.id, userId))).toHaveLength(1)
    expect(await db.select().from(schema.account).where(eq(schema.account.userId, userId))).not.toHaveLength(0)

    // Reactivate.
    const on = await scim('PATCH', `/Users/${userId}`, {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', path: 'active', value: true }],
    })
    expect(on.status).toBeLessThan(300)
    user = (await db.select().from(schema.user).where(eq(schema.user.id, userId)))[0]
    expect(user!.banned ?? false).toBe(false)
  })

  it('rejects the SCIM data plane without a valid bearer', async () => {
    const res = await scim('GET', '/Users', undefined, 'not-a-real-token')
    expect(res.status).toBe(401)
  })
})
