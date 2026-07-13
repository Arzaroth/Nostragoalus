import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { createTestDb, type TestDb } from './db'

// Proves the bearer() plugin's token contract that the native mobile client
// (apps/mobile-flutter) depends on: email sign-in returns the session token in a
// `set-auth-token` response header, and a stateless request carrying it as
// `Authorization: Bearer <token>` - NO cookie - authenticates. This is the exact
// round-trip the Flutter auth probe (lib/spike/auth_probe.dart) exercises over
// dio, verified here in-process so a regression fails the web gate, not a device.

process.env.BETTER_AUTH_SECRET = 'test-secret-for-bearer-tests'
process.env.BETTER_AUTH_URL = 'http://app.test'

// haveIBeenPwned range-check is stubbed to a suffix a random password won't match,
// so the sign-up isn't rejected as pwned (mirrors the api-key-mint test).
function mockFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes('pwnedpasswords.com')) return Promise.resolve(new Response('AAAAA1111111111111111111111111111111:1'))
  return Promise.reject(new Error(`unexpected fetch in test: ${url}`))
}

const base = 'http://app.test/api/auth'
const cred = { email: 'striker@app.test', password: 'Corr3ct-Horse-Batt3ry-Staple!', name: 'Striker' }

describe('bearer token auth (mobile client contract)', () => {
  let db: TestDb
  let client: { close: () => Promise<void> }
  let auth: ReturnType<typeof betterAuth>

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(mockFetch))
    const t = await createTestDb()
    db = t.db
    client = t.client
    const { buildAuthOptions } = await import('../lib/auth')
    auth = betterAuth(buildAuthOptions(db))
    // Register the account we then sign in against.
    await auth.handler(
      new Request(`${base}/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cred),
      }),
    )
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await client.close()
  })

  async function signIn(): Promise<Response> {
    return auth.handler(
      new Request(`${base}/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: cred.email, password: cred.password }),
      }),
    )
  }

  it('sign-in returns the token in the set-auth-token header', async () => {
    const res = await signIn()
    expect(res.status).toBe(200)
    const token = res.headers.get('set-auth-token')
    expect(token).toBeTruthy()
    expect(token!.length).toBeGreaterThan(16)
  })

  it('a Bearer token authenticates get-session with no cookie', async () => {
    const token = (await signIn()).headers.get('set-auth-token')!

    const res = await auth.handler(
      new Request(`${base}/get-session`, { headers: { authorization: `Bearer ${token}` } }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user?: { email?: string } } | null
    expect(body?.user?.email).toBe(cred.email)
  })

  it('rejects a request with no token and no cookie', async () => {
    const res = await auth.handler(new Request(`${base}/get-session`))
    // better-auth returns 200 with a null body for an unauthenticated get-session.
    const body = (await res.json()) as unknown
    expect(body).toBeNull()
  })

  it('rejects a garbage Bearer token', async () => {
    const res = await auth.handler(
      new Request(`${base}/get-session`, { headers: { authorization: 'Bearer not-a-real-token' } }),
    )
    const body = (await res.json()) as unknown
    expect(body).toBeNull()
  })
})
