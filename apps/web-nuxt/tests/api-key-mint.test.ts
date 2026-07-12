import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { createTestDb, type TestDb } from './db'
import { makeUser } from './factories'
import * as schema from '../db/schema'
import { mintApiKey } from '../server/utils/api-keys/mint'

// Proves a row built by mintApiKey (what the create-api-key mise task inserts by
// hand) is byte-compatible with @better-auth/api-key: the plugin's verifier
// accepts the plaintext and enforces the stored permissions + expiry.

process.env.BETTER_AUTH_SECRET = 'test-secret-for-mint-tests'
process.env.BETTER_AUTH_URL = 'http://app.test'

function mockFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes('pwnedpasswords.com')) return Promise.resolve(new Response('AAAAA1111111111111111111111111111111:1'))
  return Promise.reject(new Error(`unexpected fetch in test: ${url}`))
}

describe('mintApiKey produces a plugin-verifiable row', () => {
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

  async function insert(minted: ReturnType<typeof mintApiKey>): Promise<void> {
    await db.insert(schema.apikey).values({ ...minted.row, createdAt: new Date(), updatedAt: new Date() })
  }

  it('verifies with the granted permission and rejects others', async () => {
    const userId = await makeUser(db, 'admin-mint')
    const minted = mintApiKey({ name: 'streamsniper', permissions: { media: ['write'] }, referenceId: userId })
    await insert(minted)

    const ok = await auth.api.verifyApiKey({ body: { key: minted.plaintext, permissions: { media: ['write'] } } })
    expect(ok.valid).toBe(true)
    expect((ok.key as { referenceId?: string } | null)?.referenceId).toBe(userId)

    const wrong = await auth.api.verifyApiKey({ body: { key: minted.plaintext, permissions: { media: ['admin'] } } })
    expect(wrong.valid).toBe(false)
  })

  it('honours an expiry', async () => {
    const userId = await makeUser(db, 'admin-mint-2')
    const expired = mintApiKey({ name: 'old', permissions: { media: ['write'] }, referenceId: userId, expiresInSeconds: -60 })
    await insert(expired)
    const res = await auth.api.verifyApiKey({ body: { key: expired.plaintext, permissions: { media: ['write'] } } })
    expect(res.valid).toBe(false)
  })
})
