import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { memoryStorage } from '../../../tests/storage'
import { makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { enableLeagueChat, postMessage } from '../chat/service'
import { chatAttachment, user } from '../../../db/schema'
import { migrateBlobsToStorage } from './migrate'

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const owner = await makeUser(ctx.db, 'owner')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  await enableLeagueChat(ctx.db, { leagueId, actorId: owner, wraps: [{ userId: owner, wrappedKey: 'wk' }] })
  return { ...ctx, owner, leagueId }
}

describe('migrateBlobsToStorage', () => {
  it('moves legacy chat ciphertext into storage and clears the column', async () => {
    const { db, client, owner, leagueId } = await setup()
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'cap', epoch: 1 })
    await db.insert(chatAttachment).values({ messageId: m.id, idx: 0, epoch: 1, ciphertext: 'CIPHER', byteSize: 6 })
    const storage = memoryStorage()
    expect(await migrateBlobsToStorage(db, storage)).toEqual({ chatMigrated: 1, avatarMigrated: 0, avatarsSkipped: 0 })
    const row = (await db.select().from(chatAttachment).where(eq(chatAttachment.messageId, m.id)))[0]
    expect(row.ciphertext).toBeNull()
    expect(row.storageKey).toBe(`chat/${m.id}/0`)
    expect(new TextDecoder().decode(storage.store.get(`chat/${m.id}/0`)!.bytes)).toBe('CIPHER')
    await client.close()
  })

  it('moves data: avatars into storage and rewrites user.image to the serving url', async () => {
    const { db, client } = await setup()
    const b64 = Buffer.from([1, 2, 3]).toString('base64')
    await db.update(user).set({ image: `data:image/jpeg;base64,${b64}` }).where(eq(user.id, 'owner'))
    const storage = memoryStorage()
    expect(await migrateBlobsToStorage(db, storage)).toEqual({ chatMigrated: 0, avatarMigrated: 1, avatarsSkipped: 0 })
    const u = (await db.select().from(user).where(eq(user.id, 'owner')))[0]
    expect(u.image).toMatch(/^\/api\/media\/avatar\/[0-9a-f]{64}\.jpg$/)
    expect(storage.store.size).toBe(1)
    await client.close()
  })

  it('is idempotent: already-migrated rows and external avatars are left alone', async () => {
    const { db, client, owner, leagueId } = await setup()
    const storage = memoryStorage()
    // Already storage-backed (posted through the new path) and an external CDN avatar.
    await postMessage(db, { leagueId, userId: owner, ciphertext: 'x', epoch: 1, images: [{ ciphertext: 'IMG', byteSize: 3 }] }, storage)
    await db.update(user).set({ image: 'https://cdn.example/a.png' }).where(eq(user.id, 'owner'))
    expect(await migrateBlobsToStorage(db, storage)).toEqual({ chatMigrated: 0, avatarMigrated: 0, avatarsSkipped: 0 })
    expect((await db.select().from(user).where(eq(user.id, 'owner')))[0].image).toBe('https://cdn.example/a.png')
    await client.close()
  })

  it('migrates across multiple batches', async () => {
    const { db, client, owner, leagueId } = await setup()
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'cap', epoch: 1 })
    for (let i = 0; i < 5; i += 1) {
      await db.insert(chatAttachment).values({ messageId: m.id, idx: i, epoch: 1, ciphertext: `C${i}`, byteSize: 2 })
    }
    const storage = memoryStorage()
    expect(await migrateBlobsToStorage(db, storage, { batchSize: 2 })).toEqual({ chatMigrated: 5, avatarMigrated: 0, avatarsSkipped: 0 })
    expect(storage.store.size).toBe(5)
    await client.close()
  })

  it('skips an unconvertible avatar instead of aborting, and the run still terminates', async () => {
    const { db, client } = await setup()
    const good = await makeUser(db, 'good')
    const b64 = Buffer.from([1, 2, 3]).toString('base64')
    // owner: a non-image data URL that storeAvatarFromDataUrl rejects; good: a valid one.
    await db.update(user).set({ image: 'data:text/plain;base64,Zm9v' }).where(eq(user.id, 'owner'))
    await db.update(user).set({ image: `data:image/jpeg;base64,${b64}` }).where(eq(user.id, good))
    const storage = memoryStorage()
    expect(await migrateBlobsToStorage(db, storage, { batchSize: 1 })).toEqual({ chatMigrated: 0, avatarMigrated: 1, avatarsSkipped: 1 })
    // The good avatar moved; the bad row is left untouched for the operator to fix.
    expect((await db.select().from(user).where(eq(user.id, good)))[0].image).toMatch(/^\/api\/media\/avatar\//)
    expect((await db.select().from(user).where(eq(user.id, 'owner')))[0].image).toBe('data:text/plain;base64,Zm9v')
    expect(storage.store.size).toBe(1)
    await client.close()
  })
})
