import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { memoryStorage } from '../../../tests/storage'
import { chatAttachment, chatMessage, dmThread, league } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { enableLeagueChat, postMessage } from './service'
import { getAttachmentCiphertext, getMessageAttachments, listRoomMedia } from './attachments'
import { ForbiddenError, NotFoundError } from '../errors'

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const owner = await makeUser(ctx.db, 'owner')
  const member = await makeUser(ctx.db, 'member')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  await addLeagueMember(ctx.db, leagueId, member)
  await enableLeagueChat(ctx.db, { leagueId, actorId: owner, wraps: [{ userId: owner, wrappedKey: 'wk' }] })
  return { ...ctx, owner, member, leagueId, storage: memoryStorage() }
}

describe('chat attachments', () => {
  it('stores several images per message and reports them idx-ordered', async () => {
    const { db, client, owner, leagueId, storage } = await setup()
    const withImages = await postMessage(
      db,
      {
        leagueId,
        userId: owner,
        ciphertext: 'cap',
        epoch: 1,
        images: [
          { ciphertext: 'A', byteSize: 1 },
          { ciphertext: 'B', byteSize: 2 },
        ],
      },
      storage,
    )
    const plain = await postMessage(db, { leagueId, userId: owner, ciphertext: 'hi', epoch: 1 })
    expect(withImages.attachments).toEqual([
      { idx: 0, epoch: 1 },
      { idx: 1, epoch: 1 },
    ])
    expect(plain.attachments).toEqual([])
    const map = await getMessageAttachments(db, [withImages.id, plain.id])
    expect(map.get(withImages.id)).toEqual([
      { idx: 0, epoch: 1 },
      { idx: 1, epoch: 1 },
    ])
    expect(map.has(plain.id)).toBe(false)
    expect((await getMessageAttachments(db, [])).size).toBe(0)
    await client.close()
  })

  it('rejects more than the per-message image cap', async () => {
    const { db, client, owner, leagueId } = await setup()
    const images = Array.from({ length: 7 }, (_, i) => ({ ciphertext: `x${i}`, byteSize: 1 }))
    await expect(postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 1, images })).rejects.toThrow()
    await client.close()
  })

  it('serves a ciphertext by (message, idx) with its epoch, refusing non-members / missing', async () => {
    const { db, client, owner, member, leagueId, storage } = await setup()
    const m = await postMessage(
      db,
      {
        leagueId,
        userId: owner,
        ciphertext: 'cap',
        epoch: 1,
        images: [
          { ciphertext: 'IMG0', byteSize: 9 },
          { ciphertext: 'IMG1', byteSize: 9 },
        ],
      },
      storage,
    )
    expect(await getAttachmentCiphertext(db, m.id, 0, member, storage)).toEqual({ ciphertext: 'IMG0', epoch: 1 })
    expect(await getAttachmentCiphertext(db, m.id, 1, member, storage)).toEqual({ ciphertext: 'IMG1', epoch: 1 })
    const stranger = await makeUser(db, 'stranger')
    await expect(getAttachmentCiphertext(db, m.id, 0, stranger, storage)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(getAttachmentCiphertext(db, m.id, 9, owner, storage)).rejects.toBeInstanceOf(NotFoundError)
    const plain = await postMessage(db, { leagueId, userId: owner, ciphertext: 'hi', epoch: 1 })
    await expect(getAttachmentCiphertext(db, plain.id, 0, owner)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('withholds images of a removed or pending message, and from the media gallery', async () => {
    const { db, client, owner, member, leagueId, storage } = await setup()
    const removed = await postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 1, images: [{ ciphertext: 'IMG1', byteSize: 9 }] }, storage)
    const pending = await postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 1, images: [{ ciphertext: 'IMG2', byteSize: 9 }] }, storage)
    const visible = await postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 1, images: [{ ciphertext: 'IMG3', byteSize: 9 }] }, storage)
    await db.update(chatMessage).set({ moderationState: 'REMOVED' }).where(eq(chatMessage.id, removed.id))
    await db.update(chatMessage).set({ moderationState: 'PENDING' }).where(eq(chatMessage.id, pending.id))
    // Removed: hidden from everyone.
    await expect(getAttachmentCiphertext(db, removed.id, 0, owner, storage)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getAttachmentCiphertext(db, removed.id, 0, member, storage)).rejects.toBeInstanceOf(NotFoundError)
    // Pending: hidden from a non-moderator member, served to the owner.
    await expect(getAttachmentCiphertext(db, pending.id, 0, member, storage)).rejects.toBeInstanceOf(NotFoundError)
    expect((await getAttachmentCiphertext(db, pending.id, 0, owner, storage)).ciphertext).toBe('IMG2')
    // Media gallery: a member sees only the visible image; the owner also the pending.
    const memberMedia = await listRoomMedia(db, { leagueId, userId: member })
    expect(memberMedia.map((r) => r.messageId)).toEqual([visible.id])
    const ownerMedia = await listRoomMedia(db, { leagueId, userId: owner })
    expect(ownerMedia.map((r) => r.messageId).sort()).toEqual([pending.id, visible.id].sort())
    const stranger = await makeUser(db, 'stranger')
    await expect(listRoomMedia(db, { leagueId, userId: stranger })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('rejects an oversized image blob', async () => {
    const { db, client, owner, leagueId } = await setup()
    const huge = 'x'.repeat(9_000_001)
    await expect(
      postMessage(db, { leagueId, userId: owner, ciphertext: 'cap', epoch: 1, images: [{ ciphertext: huge, byteSize: 1 }] }),
    ).rejects.toThrow()
    expect((await db.select().from(league).where(eq(league.id, leagueId))).length).toBe(1)
    await client.close()
  })

  it('serves a DM attachment to a participant and 404s a non-participant', async () => {
    const { db, client, owner, member, storage } = await setup()
    // A DM thread + a DM chat_message (leagueId null) with an attachment.
    const [lo, hi] = owner < member ? [owner, member] : [member, owner]
    const t = await db.insert(dmThread).values({ userAId: lo, userBId: hi }).returning({ id: dmThread.id })
    const dmMsg = await db.insert(chatMessage).values({ dmThreadId: t[0].id, userId: owner, epoch: 1, ciphertext: 'secret' }).returning({ id: chatMessage.id })
    await db.insert(chatAttachment).values({ messageId: dmMsg[0].id, idx: 0, epoch: 1, ciphertext: 'IMG', byteSize: 3 })
    // A participant gets the ciphertext; a non-participant cannot see the message.
    expect(await getAttachmentCiphertext(db, dmMsg[0].id, 0, member, storage)).toEqual({ ciphertext: 'IMG', epoch: 1 })
    const stranger = await makeUser(db, 'stranger-dm')
    await expect(getAttachmentCiphertext(db, dmMsg[0].id, 0, stranger, storage)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('serves a legacy in-db ciphertext without touching storage', async () => {
    const { db, client, owner, leagueId } = await setup()
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'cap', epoch: 1 })
    // A pre-migration attachment keeps its blob in the column (storage_key null).
    await db.insert(chatAttachment).values({ messageId: m.id, idx: 0, epoch: 1, ciphertext: 'LEGACY', byteSize: 3 })
    // No driver passed: a column-backed row must resolve without reaching storage.
    expect(await getAttachmentCiphertext(db, m.id, 0, owner)).toEqual({ ciphertext: 'LEGACY', epoch: 1 })
    await client.close()
  })
})
