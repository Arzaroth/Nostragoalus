import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { createTestDb, type TestDb } from './db'
import { makeUser } from './factories'

// Proves the hand-authored `apikey` table in db/auth-schema.ts matches what the
// @better-auth/api-key plugin expects: a real create + verify round-trip against
// pglite (real migrations). A field/type mismatch surfaces here, not in prod.

process.env.BETTER_AUTH_SECRET = 'test-secret-for-api-key-tests'
process.env.BETTER_AUTH_URL = 'http://app.test'

function mockFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes('pwnedpasswords.com')) return Promise.resolve(new Response('AAAAA1111111111111111111111111111111:1'))
  return Promise.reject(new Error(`unexpected fetch in test: ${url}`))
}

describe('@better-auth/api-key against the hand-authored table', () => {
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
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await client.close()
  })

  it('creates a scoped key and verifies permission scoping', async () => {
    const userId = await makeUser(db, 'keyowner')
    const created = (await auth.api.createApiKey({
      body: { name: 'bot', userId, permissions: { media: ['write'] }, rateLimitEnabled: false },
    })) as { key: string; start: string | null; referenceId: string }

    expect(created.key).toBeTruthy()
    expect(created.referenceId).toBe(userId)

    const ok = await auth.api.verifyApiKey({ body: { key: created.key, permissions: { media: ['write'] } } })
    expect(ok.valid).toBe(true)
    expect((ok.key as { referenceId?: string } | null)?.referenceId).toBe(userId)

    // Missing the requested permission, and an unknown key, both fail.
    const wrongPerm = await auth.api.verifyApiKey({ body: { key: created.key, permissions: { media: ['admin'] } } })
    expect(wrongPerm.valid).toBe(false)
    const unknown = await auth.api.verifyApiKey({ body: { key: 'not-a-real-key', permissions: { media: ['write'] } } })
    expect(unknown.valid).toBe(false)
  })
})
