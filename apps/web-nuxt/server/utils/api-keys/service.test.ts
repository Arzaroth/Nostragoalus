import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { apikey } from '../../../db/schema'
import { createApiKey, listApiKeys, permsFromScopes, revokeApiKey } from './service'
import { hashApiKey } from './mint'

async function setup() {
  const ctx = await createTestDb()
  const owner = await makeUser(ctx.db, 'admin1')
  return { ...ctx, owner }
}

describe('createApiKey', () => {
  it('mints an ng_ key, stores it hashed with the scoped permissions, no plaintext at rest', async () => {
    const { db, client, owner } = await setup()
    const { key } = await createApiKey(db, { name: 'bot', scopes: ['media:write'], referenceId: owner })
    expect(key.startsWith('ng_')).toBe(true)
    const [row] = await db.select().from(apikey)
    expect(row.key).toBe(hashApiKey(key))
    expect(row.key).not.toBe(key)
    expect(row.referenceId).toBe(owner)
    expect(row.start).toBe(key.slice(0, 6))
    expect(row.permissions).toBe(JSON.stringify({ media: ['write'] }))
    expect(row.expiresAt).toBeNull()
    await client.close()
  })

  it('sets expiresAt when given a TTL', async () => {
    const { db, client, owner } = await setup()
    await createApiKey(db, { name: 'temp', scopes: ['media:write'], referenceId: owner, expiresInSeconds: 3600 })
    const [row] = await db.select().from(apikey)
    expect(row.expiresAt).toBeInstanceOf(Date)
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now())
    await client.close()
  })
})

describe('listApiKeys', () => {
  it('returns every owner key newest-first, with owner email and parsed permissions, never the hash', async () => {
    const { db, client, owner } = await setup()
    const other = await makeUser(db, 'admin2')
    // Explicit createdAt so the ordering assertion is deterministic.
    await db.insert(apikey).values({
      id: 'k-old',
      key: 'h-old',
      referenceId: owner,
      permissions: JSON.stringify({ media: ['write'] }),
      start: 'ng_aaa',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
    await db.insert(apikey).values({
      id: 'k-new',
      key: 'h-new',
      referenceId: other,
      permissions: null,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    })
    const rows = await listApiKeys(db)
    expect(rows.map((r) => r.id)).toEqual(['k-new', 'k-old'])
    expect(rows[0].ownerEmail).toBe('admin2@example.com')
    expect(rows[1].ownerEmail).toBe('admin1@example.com')
    expect(rows[0].permissions).toBeNull()
    expect(rows[1].permissions).toEqual({ media: ['write'] })
    // iso(): expiresAt present -> string, lastRequest absent -> null.
    expect(typeof rows[1].expiresAt).toBe('string')
    expect(rows[1].lastRequest).toBeNull()
    // The secret hash is never surfaced.
    expect('key' in rows[0]).toBe(false)
    await client.close()
  })

  it('maps malformed stored permissions to null instead of throwing', async () => {
    const { db, client, owner } = await setup()
    await db.insert(apikey).values({ id: 'k-bad', key: 'h', referenceId: owner, permissions: 'not-json' })
    const rows = await listApiKeys(db)
    expect(rows[0].permissions).toBeNull()
    await client.close()
  })
})

describe('revokeApiKey', () => {
  it('deletes a key and reports whether a row was removed', async () => {
    const { db, client, owner } = await setup()
    const { key: _key } = await createApiKey(db, { name: 'bot', scopes: ['media:write'], referenceId: owner })
    const [row] = await db.select({ id: apikey.id }).from(apikey)
    expect(await revokeApiKey(db, row.id)).toBe(true)
    expect(await db.select().from(apikey).where(eq(apikey.id, row.id))).toHaveLength(0)
    expect(await revokeApiKey(db, 'does-not-exist')).toBe(false)
    await client.close()
  })
})

describe('permsFromScopes', () => {
  it('groups actions per resource', () => {
    expect(permsFromScopes(['media:write'])).toEqual({ media: ['write'] })
    // Two scopes on one resource exercise the "resource already seen" branch.
    expect(permsFromScopes(['media:write', 'media:write'])).toEqual({ media: ['write', 'write'] })
  })
})
