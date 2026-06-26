import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { chatMessage, league } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { enableLeagueChat, postMessage } from './service'
import { getAttachmentCiphertext, getAttachmentMessageIds } from './attachments'
import { ForbiddenError, NotFoundError } from '../errors'

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const owner = await makeUser(ctx.db, 'owner')
  const member = await makeUser(ctx.db, 'member')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  await addLeagueMember(ctx.db, leagueId, member)
  await enableLeagueChat(ctx.db, { leagueId, actorId: owner, wraps: [{ userId: owner, wrappedKey: 'wk' }] })
  return { ...ctx, owner, member, leagueId }
}

describe('chat attachments', () => {
  it('stores an image with a message and reports which messages have one', async () => {
    const { db, client, owner, leagueId } = await setup()
    const withImage = await postMessage(db, { leagueId, userId: owner, ciphertext: 'cap', epoch: 1, image: { ciphertext: 'ENCIMG', byteSize: 1234 } })
    const plain = await postMessage(db, { leagueId, userId: owner, ciphertext: 'hi', epoch: 1 })
    expect(withImage.hasAttachment).toBe(true)
    expect(plain.hasAttachment).toBe(false)
    const ids = await getAttachmentMessageIds(db, [withImage.id, plain.id])
    expect(ids.has(withImage.id)).toBe(true)
    expect(ids.has(plain.id)).toBe(false)
    expect(await getAttachmentMessageIds(db, [])).toEqual(new Set())
    await client.close()
  })

  it('serves the ciphertext to a member and refuses non-members / missing attachments', async () => {
    const { db, client, owner, member, leagueId } = await setup()
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'cap', epoch: 1, image: { ciphertext: 'ENCIMG', byteSize: 9 } })
    expect(await getAttachmentCiphertext(db, m.id, member)).toBe('ENCIMG')
    const stranger = await makeUser(db, 'stranger')
    await expect(getAttachmentCiphertext(db, m.id, stranger)).rejects.toBeInstanceOf(ForbiddenError)
    const plain = await postMessage(db, { leagueId, userId: owner, ciphertext: 'hi', epoch: 1 })
    await expect(getAttachmentCiphertext(db, plain.id, owner)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('withholds the image of a removed or pending message like messages.get does', async () => {
    const { db, client, owner, member, leagueId } = await setup()
    const removed = await postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 1, image: { ciphertext: 'IMG1', byteSize: 9 } })
    const pending = await postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 1, image: { ciphertext: 'IMG2', byteSize: 9 } })
    await db.update(chatMessage).set({ moderationState: 'REMOVED' }).where(eq(chatMessage.id, removed.id))
    await db.update(chatMessage).set({ moderationState: 'PENDING' }).where(eq(chatMessage.id, pending.id))
    // Removed: hidden from everyone, including a moderator.
    await expect(getAttachmentCiphertext(db, removed.id, owner)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getAttachmentCiphertext(db, removed.id, member)).rejects.toBeInstanceOf(NotFoundError)
    // Pending: hidden from a non-moderator member, still served to the owner.
    await expect(getAttachmentCiphertext(db, pending.id, member)).rejects.toBeInstanceOf(NotFoundError)
    expect(await getAttachmentCiphertext(db, pending.id, owner)).toBe('IMG2')
    await client.close()
  })

  it('rejects an oversized image blob', async () => {
    const { db, client, owner, leagueId } = await setup()
    const huge = 'x'.repeat(9_000_001)
    await expect(
      postMessage(db, { leagueId, userId: owner, ciphertext: 'cap', epoch: 1, image: { ciphertext: huge, byteSize: 1 } }),
    ).rejects.toThrow()
    // sanity: the league exists, nothing partial committed
    expect((await db.select().from(league).where(eq(league.id, leagueId))).length).toBe(1)
    await client.close()
  })
})
