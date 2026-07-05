import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { chatIdentity, chatMessage, dmThread, dmThreadKey, dmThreadRead, user } from '../../../db/schema'
import {
  createThread,
  editDmMessage,
  getDmReadMarker,
  getPublicIdentity,
  getThreadDetail,
  getThreadForPair,
  listDmMessages,
  listThreads,
  markThreadRead,
  orderPair,
  postDmMessage,
  requireParticipant,
  searchRecipients,
} from './service'
import { getAttachmentCiphertext, getMessageAttachments, listRoomMedia } from '../chat/attachments'
import { getMessageReactionTotals, setChatReaction } from '../chat/reactions'
import { emptyReactionTotals } from '../../../shared/reactions'
import { memoryStorage } from '../../../tests/storage'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']

// A user with a chat identity - the prerequisite for being DMed.
async function mkUser(db: Db, id: string): Promise<string> {
  await makeUser(db, id)
  await db.insert(chatIdentity).values({ userId: id, publicKey: `pk-${id}` })
  return id
}

function wrapsFor(ids: string[]) {
  return ids.map((u) => ({ userId: u, wrappedKey: `wk-${u}` }))
}

// Open a thread the normal way and return its id.
async function openThread(db: Db, a: string, b: string): Promise<string> {
  const r = await createThread(db, { userId: a, recipientId: b, wraps: wrapsFor([a, b]) })
  return r.threadId
}

describe('orderPair', () => {
  it('sorts the pair canonically in either input order', () => {
    expect(orderPair('aaa', 'bbb')).toEqual(['aaa', 'bbb'])
    expect(orderPair('bbb', 'aaa')).toEqual(['aaa', 'bbb'])
  })
})

describe('getThreadForPair', () => {
  it('finds the same row for either order and null when absent', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    const b = await mkUser(db, 'bbb')
    expect(await getThreadForPair(db, a, b)).toBeNull()
    const threadId = await openThread(db, a, b)
    const byAb = await getThreadForPair(db, a, b)
    const byBa = await getThreadForPair(db, b, a)
    expect(byAb?.id).toBe(threadId)
    expect(byBa?.id).toBe(threadId)
    expect(byAb?.keyEpoch).toBe(1)
    await client.close()
  })
})

describe('requireParticipant', () => {
  it('resolves otherId from either side and 404s a non-participant or unknown thread', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa') // smaller -> userAId
    const b = await mkUser(db, 'bbb') // larger -> userBId
    const stranger = await mkUser(db, 'zzz')
    const threadId = await openThread(db, a, b)
    // Caller is userAId -> other is userBId, and vice versa.
    expect((await requireParticipant(db, threadId, a)).otherId).toBe(b)
    expect((await requireParticipant(db, threadId, b)).otherId).toBe(a)
    await expect(requireParticipant(db, threadId, stranger)).rejects.toBeInstanceOf(NotFoundError)
    await expect(requireParticipant(db, '00000000-0000-0000-0000-000000000000', a)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('getPublicIdentity', () => {
  it('returns the identity when present and null when absent', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    const noId = await makeUser(db, 'plain') // user, no chat identity
    const got = await getPublicIdentity(db, a)
    expect(got).toMatchObject({ userId: a, publicKey: 'pk-aaa', name: 'aaa' })
    expect(await getPublicIdentity(db, noId)).toBeNull()
    await client.close()
  })
})

describe('createThread', () => {
  it('creates a fresh thread and persists both wraps at epoch 1', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    const b = await mkUser(db, 'bbb')
    const r = await createThread(db, { userId: a, recipientId: b, wraps: wrapsFor([a, b]) })
    expect(r).toMatchObject({ created: true, epoch: 1, otherId: b })
    const keys = await db.select().from(dmThreadKey).where(eq(dmThreadKey.threadId, r.threadId))
    expect(keys.map((k) => k.userId).sort()).toEqual([a, b].sort())
    expect(keys.every((k) => k.epoch === 1)).toBe(true)
    const t = (await db.select().from(dmThread).where(eq(dmThread.id, r.threadId)))[0]
    expect(t.userAId).toBe(a) // canonical order
    expect(t.userBId).toBe(b)
    await client.close()
  })

  it('is idempotent: an existing thread is returned untouched', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    const b = await mkUser(db, 'bbb')
    const first = await createThread(db, { userId: a, recipientId: b, wraps: wrapsFor([a, b]) })
    // Different (ignored) wraps, reversed caller/recipient: same thread, created=false.
    const second = await createThread(db, { userId: b, recipientId: a, wraps: [{ userId: b, wrappedKey: 'IGNORED' }, { userId: a, wrappedKey: 'IGNORED' }] })
    expect(second).toEqual({ threadId: first.threadId, epoch: 1, created: false, otherId: a })
    // The original wraps stand.
    const bKey = (await db.select().from(dmThreadKey).where(and(eq(dmThreadKey.threadId, first.threadId), eq(dmThreadKey.userId, b))))[0]
    expect(bKey.wrappedKey).toBe('wk-bbb')
    await client.close()
  })

  it('rejects DMing yourself', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    await expect(createThread(db, { userId: a, recipientId: a, wraps: wrapsFor([a]) })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('rejects a recipient without a chat identity', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    const noId = await makeUser(db, 'plain')
    await expect(createThread(db, { userId: a, recipientId: noId, wraps: wrapsFor([a, noId]) })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('rejects the wrong number of wraps or a wrap for a non-participant', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    const b = await mkUser(db, 'bbb')
    const c = await mkUser(db, 'ccc')
    await expect(createThread(db, { userId: a, recipientId: b, wraps: wrapsFor([a]) })).rejects.toBeInstanceOf(ValidationError)
    await expect(createThread(db, { userId: a, recipientId: b, wraps: wrapsFor([a, c]) })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('returns the winner on a concurrent create race (both callers, same pair)', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    const b = await mkUser(db, 'bbb')
    const [r1, r2] = await Promise.all([
      createThread(db, { userId: a, recipientId: b, wraps: wrapsFor([a, b]) }),
      createThread(db, { userId: b, recipientId: a, wraps: wrapsFor([a, b]) }),
    ])
    // Exactly one won the unique-pair race; both resolve to the same thread.
    expect(r1.threadId).toBe(r2.threadId)
    expect([r1.created, r2.created].sort()).toEqual([false, true])
    const rows = await db.select().from(dmThread).where(eq(dmThread.userAId, a))
    expect(rows).toHaveLength(1)
    await client.close()
  })

  it('surfaces a ConflictError when the create fails and no thread emerges', async () => {
    const { db, client } = await createTestDb()
    const b = await mkUser(db, 'bbb')
    // Caller has no user row, so the thread insert FK fails and nothing is created.
    await expect(
      createThread(db, { userId: 'ghost', recipientId: b, wraps: [{ userId: 'ghost', wrappedKey: 'x' }, { userId: b, wrappedKey: 'y' }] }),
    ).rejects.toBeInstanceOf(ConflictError)
    await client.close()
  })
})

describe('listThreads', () => {
  it('returns an empty inbox for someone with no threads', async () => {
    const { db, client } = await createTestDb()
    const a = await mkUser(db, 'aaa')
    expect(await listThreads(db, a)).toEqual([])
    await client.close()
  })

  it('orders by last activity and resolves the current-epoch wrapped key', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const x = await mkUser(db, 'xxx')
    const y = await mkUser(db, 'yyy')
    await db.update(user).set({ image: 'https://img/y.png' }).where(eq(user.id, y))
    const t1 = await openThread(db, me, x)
    const t2 = await openThread(db, me, y)
    // t2 is more recently active, so it sorts first.
    await db.update(dmThread).set({ lastMessageAt: new Date('2026-01-01T00:00:00Z') }).where(eq(dmThread.id, t1))
    await db.update(dmThread).set({ lastMessageAt: new Date('2026-02-01T00:00:00Z') }).where(eq(dmThread.id, t2))
    const inbox = await listThreads(db, me)
    expect(inbox.map((r) => r.threadId)).toEqual([t2, t1])
    expect(inbox[0].other.id).toBe(y)
    expect(inbox[0].other.image).toBe('https://img/y.png')
    expect(inbox[0].myWrappedKey).toBe('wk-aaa')
    expect(inbox[0].lastMessageAt).toBeInstanceOf(Date)
    await client.close()
  })

  it('counts unread excluding own, removed and read messages, and floors at thread creation', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const at = (iso: string) => new Date(iso)
    // Read up to 12:00: only messages after it, from the other, still visible count.
    await db.insert(dmThreadRead).values({ userId: me, threadId, lastReadAt: at('2026-01-01T12:00:00Z') })
    await db.insert(chatMessage).values([
      { dmThreadId: threadId, userId: other, epoch: 1, ciphertext: 'before', createdAt: at('2026-01-01T11:00:00Z') }, // before read
      { dmThreadId: threadId, userId: other, epoch: 1, ciphertext: 'unread', createdAt: at('2026-01-01T13:00:00Z') }, // counts
      { dmThreadId: threadId, userId: me, epoch: 1, ciphertext: 'mine', createdAt: at('2026-01-01T13:30:00Z') }, // own, excluded
      { dmThreadId: threadId, userId: other, epoch: 1, ciphertext: 'gone', moderationState: 'REMOVED', createdAt: at('2026-01-01T14:00:00Z') }, // removed
    ])
    const inbox = await listThreads(db, me)
    expect(inbox.find((r) => r.threadId === threadId)?.unread).toBe(1)
    await client.close()
  })

  it('floors unread at thread creation when there is no read marker', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    await db.insert(chatMessage).values({ dmThreadId: threadId, userId: other, epoch: 1, ciphertext: 'hi' })
    const inbox = await listThreads(db, me)
    expect(inbox.find((r) => r.threadId === threadId)?.unread).toBe(1)
    await client.close()
  })

  it('reports a null wrapped key when the caller has no key at the current epoch', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    // Rotate the thread past the caller's only (epoch-1) key.
    await db.update(dmThread).set({ keyEpoch: 2 }).where(eq(dmThread.id, threadId))
    const inbox = await listThreads(db, me)
    expect(inbox[0].myWrappedKey).toBeNull()
    await client.close()
  })
})

describe('getThreadDetail', () => {
  it('returns the other identity and every-epoch keys, ordered by epoch', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    // A second epoch key for the caller (older key retained for history).
    await db.insert(dmThreadKey).values({ threadId, userId: me, epoch: 2, wrappedKey: 'wk2-aaa' })
    await db.update(dmThread).set({ keyEpoch: 2 }).where(eq(dmThread.id, threadId))
    const detail = await getThreadDetail(db, threadId, me)
    expect(detail.epoch).toBe(2)
    expect(detail.other).toMatchObject({ userId: other, publicKey: 'pk-bbb' })
    expect(detail.myWrappedKeys).toEqual([
      { epoch: 1, wrappedKey: 'wk-aaa' },
      { epoch: 2, wrappedKey: 'wk2-aaa' },
    ])
    await client.close()
  })

  it('404s a non-participant', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const stranger = await mkUser(db, 'zzz')
    const threadId = await openThread(db, me, other)
    await expect(getThreadDetail(db, threadId, stranger)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('404s when the other participant lost their chat identity', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    await db.delete(chatIdentity).where(eq(chatIdentity.userId, other))
    await expect(getThreadDetail(db, threadId, me)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('postDmMessage', () => {
  it('posts a message and bumps the thread lastMessageAt', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const msg = await postDmMessage(db, { threadId, userId: me, ciphertext: 'hello', epoch: 1 })
    expect(msg.ciphertext).toBe('hello')
    expect(msg.otherId).toBe(other)
    const t = (await db.select().from(dmThread).where(eq(dmThread.id, threadId)))[0]
    expect(t.lastMessageAt).toEqual(msg.createdAt)
    await client.close()
  })

  it('rejects empty or oversized ciphertext', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    await expect(postDmMessage(db, { threadId, userId: me, ciphertext: '', epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    await expect(postDmMessage(db, { threadId, userId: me, ciphertext: 'x'.repeat(16_385), epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('404s a non-participant and conflicts on a stale epoch', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const stranger = await mkUser(db, 'zzz')
    const threadId = await openThread(db, me, other)
    await expect(postDmMessage(db, { threadId, userId: stranger, ciphertext: 'c', epoch: 1 })).rejects.toBeInstanceOf(NotFoundError)
    await expect(postDmMessage(db, { threadId, userId: me, ciphertext: 'c', epoch: 2 })).rejects.toBeInstanceOf(ConflictError)
    await client.close()
  })

  it('stores images to the backend before the row and returns their descriptors', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const storage = memoryStorage()
    const msg = await postDmMessage(
      db,
      { threadId, userId: me, ciphertext: 'hi', epoch: 1, images: [{ ciphertext: 'A', byteSize: 1 }, { ciphertext: 'B', byteSize: 2 }] },
      storage,
    )
    expect(msg.attachments).toEqual([{ idx: 0, epoch: 1 }, { idx: 1, epoch: 1 }])
    // Descriptors surface through the shared chat listing, and the bytes round-trip.
    const byMessage = await getMessageAttachments(db, [msg.id])
    expect(byMessage.get(msg.id)).toEqual([{ idx: 0, epoch: 1 }, { idx: 1, epoch: 1 }])
    expect((await getAttachmentCiphertext(db, msg.id, 0, other, storage)).ciphertext).toBe('A')
    expect(storage.store.has(`chat/${msg.id}/1`)).toBe(true)
    await client.close()
  })

  it('rejects too many images or an oversized image', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const storage = memoryStorage()
    await expect(
      postDmMessage(db, { threadId, userId: me, ciphertext: 'hi', epoch: 1, images: Array.from({ length: 7 }, () => ({ ciphertext: 'x', byteSize: 1 })) }, storage),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      postDmMessage(db, { threadId, userId: me, ciphertext: 'hi', epoch: 1, images: [{ ciphertext: 'x'.repeat(9_000_001), byteSize: 1 }] }, storage),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('accepts an in-thread quote and thread root, and rejects cross-thread targets', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const third = await mkUser(db, 'ccc')
    const t1 = await openThread(db, me, other)
    const t2 = await openThread(db, me, third)
    const root = await postDmMessage(db, { threadId: t1, userId: me, ciphertext: 'root', epoch: 1 })
    const reply = await postDmMessage(db, { threadId: t1, userId: me, ciphertext: 'r', epoch: 1, parentId: root.id, threadRootId: root.id })
    expect(reply.parentId).toBe(root.id)
    expect(reply.threadId).toBe(root.id)
    // A message from another thread cannot be quoted here.
    const foreign = await postDmMessage(db, { threadId: t2, userId: me, ciphertext: 'x', epoch: 1 })
    await expect(postDmMessage(db, { threadId: t1, userId: me, ciphertext: 'q', epoch: 1, parentId: foreign.id })).rejects.toBeInstanceOf(ValidationError)
    await expect(postDmMessage(db, { threadId: t1, userId: me, ciphertext: 'q', epoch: 1, threadRootId: foreign.id })).rejects.toBeInstanceOf(ValidationError)
    // An unknown target id is likewise rejected.
    await expect(postDmMessage(db, { threadId: t1, userId: me, ciphertext: 'q', epoch: 1, parentId: '00000000-0000-0000-0000-000000000000' })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })
})

describe('editDmMessage', () => {
  it('lets the author replace their own visible message and stamps editedAt', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const msg = await postDmMessage(db, { threadId, userId: me, ciphertext: 'orig', epoch: 1 })
    const res = await editDmMessage(db, { threadId, messageId: msg.id, userId: me, ciphertext: 'edited' })
    expect(res.editedAt).toBeInstanceOf(Date)
    const row = (await db.select().from(chatMessage).where(eq(chatMessage.id, msg.id)))[0]
    expect(row.ciphertext).toBe('edited')
    expect(row.editedAt).not.toBeNull()
    await client.close()
  })

  it('validates the new ciphertext', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const msg = await postDmMessage(db, { threadId, userId: me, ciphertext: 'orig', epoch: 1 })
    await expect(editDmMessage(db, { threadId, messageId: msg.id, userId: me, ciphertext: '' })).rejects.toBeInstanceOf(ValidationError)
    await expect(editDmMessage(db, { threadId, messageId: msg.id, userId: me, ciphertext: 'x'.repeat(16_385) })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('forbids a non-author, refuses a non-visible message and 404s wrong-thread / unknown ids', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const third = await mkUser(db, 'ccc')
    const t1 = await openThread(db, me, other)
    const t2 = await openThread(db, me, third)
    const mine = await postDmMessage(db, { threadId: t1, userId: me, ciphertext: 'orig', epoch: 1 })
    const theirs = await postDmMessage(db, { threadId: t1, userId: other, ciphertext: 'theirs', epoch: 1 })
    await expect(editDmMessage(db, { threadId: t1, messageId: theirs.id, userId: me, ciphertext: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
    // A removed message cannot be edited.
    await db.update(chatMessage).set({ moderationState: 'REMOVED' }).where(eq(chatMessage.id, mine.id))
    await expect(editDmMessage(db, { threadId: t1, messageId: mine.id, userId: me, ciphertext: 'x' })).rejects.toBeInstanceOf(ValidationError)
    // A message that lives in another thread than the route's id is not found.
    const inT2 = await postDmMessage(db, { threadId: t2, userId: me, ciphertext: 'o', epoch: 1 })
    await expect(editDmMessage(db, { threadId: t1, messageId: inT2.id, userId: me, ciphertext: 'x' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(editDmMessage(db, { threadId: t1, messageId: '00000000-0000-0000-0000-000000000000', userId: me, ciphertext: 'x' })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('drops and appends images on edit, keeping idx stable and the cap enforced', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const storage = memoryStorage()
    const m = await postDmMessage(
      db,
      { threadId, userId: me, ciphertext: 'orig', epoch: 1, images: [{ ciphertext: 'A', byteSize: 1 }, { ciphertext: 'B', byteSize: 1 }, { ciphertext: 'C', byteSize: 1 }] },
      storage,
    )
    // Drop idx 1, append a new image: survivors keep their idx, the new one appends
    // after the highest idx that ever existed (3), never reusing the removed 1.
    const res = await editDmMessage(
      db,
      { threadId, messageId: m.id, userId: me, ciphertext: 'edited', removeIdxs: [1], addImages: [{ ciphertext: 'D', byteSize: 1 }] },
      storage,
    )
    expect(res.attachments).toEqual([{ idx: 0, epoch: 1 }, { idx: 2, epoch: 1 }, { idx: 3, epoch: 1 }])
    expect((await getAttachmentCiphertext(db, m.id, 0, other, storage)).ciphertext).toBe('A')
    await expect(getAttachmentCiphertext(db, m.id, 1, other, storage)).rejects.toBeInstanceOf(NotFoundError)
    expect((await getAttachmentCiphertext(db, m.id, 3, other, storage)).ciphertext).toBe('D')
    // The dropped image's object is gone from storage too (not just the row).
    expect(storage.store.has(`chat/${m.id}/1`)).toBe(false)
    // Adding past the six-image cap is rejected.
    await expect(
      editDmMessage(db, { threadId, messageId: m.id, userId: me, ciphertext: 'edited', addImages: Array.from({ length: 4 }, () => ({ ciphertext: 'n', byteSize: 1 })) }, storage),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('rejects an oversized appended image on edit', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const m = await postDmMessage(db, { threadId, userId: me, ciphertext: 'orig', epoch: 1 })
    await expect(
      editDmMessage(db, { threadId, messageId: m.id, userId: me, ciphertext: 'x', addImages: [{ ciphertext: 'x'.repeat(9_000_001), byteSize: 1 }] }),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })
})

// The DM message gallery and reactions run through the shared chat utilities in
// their DM scope - exercise those DM branches here (parity with league chat).
describe('DM media and reactions (shared chat utils, DM scope)', () => {
  it('lists a thread images newest-first for a participant and 404s a non-participant', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const stranger = await mkUser(db, 'zzz')
    const threadId = await openThread(db, me, other)
    const storage = memoryStorage()
    const m = await postDmMessage(db, { threadId, userId: me, ciphertext: 'pic', epoch: 1, images: [{ ciphertext: 'A', byteSize: 1 }] }, storage)
    const media = await listRoomMedia(db, { threadId, userId: me })
    expect(media).toEqual([{ messageId: m.id, idx: 0, epoch: 1, createdAt: m.createdAt }])
    await expect(listRoomMedia(db, { threadId, userId: stranger })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('reacts on a DM message and totals it, with an empty fallback for an un-reacted message', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const m = await postDmMessage(db, { threadId, userId: me, ciphertext: 'hi', epoch: 1 })
    expect(await getMessageReactionTotals(db, m.id)).toEqual(emptyReactionTotals())
    const ctx = await setChatReaction(db, { messageId: m.id, userId: other, emoji: 'FIRE' })
    expect(ctx.kind).toBe('dm')
    expect((await getMessageReactionTotals(db, m.id)).FIRE).toBe(1)
    await client.close()
  })
})

describe('getDmReadMarker', () => {
  it('returns the caller marker after a read and null before one, participant-scoped', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    expect(await getDmReadMarker(db, threadId, me)).toBeNull()
    await markThreadRead(db, threadId, me)
    expect(await getDmReadMarker(db, threadId, me)).toBeInstanceOf(Date)
    // The other participant has their own (still absent) marker.
    expect(await getDmReadMarker(db, threadId, other)).toBeNull()
    await client.close()
  })
})

describe('listDmMessages', () => {
  it('404s a non-participant', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const stranger = await mkUser(db, 'zzz')
    const threadId = await openThread(db, me, other)
    await expect(listDmMessages(db, { threadId, userId: stranger })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('lists the main thread newest-first, paginates and clamps the page size', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const t = (s: number) => new Date(`2026-06-10T10:0${s}:00Z`)
    await db.insert(chatMessage).values([
      { dmThreadId: threadId, userId: me, epoch: 1, ciphertext: 'm1', createdAt: t(1) },
      { dmThreadId: threadId, userId: me, epoch: 1, ciphertext: 'm2', createdAt: t(2) },
      { dmThreadId: threadId, userId: me, epoch: 1, ciphertext: 'm3', createdAt: t(3) },
    ])
    expect((await listDmMessages(db, { threadId, userId: me })).map((r) => r.ciphertext)).toEqual(['m3', 'm2', 'm1'])
    expect((await listDmMessages(db, { threadId, userId: me, limit: 2 })).map((r) => r.ciphertext)).toEqual(['m3', 'm2'])
    expect((await listDmMessages(db, { threadId, userId: me, before: t(2) })).map((r) => r.ciphertext)).toEqual(['m1'])
    // Clamped up to 1, and down to the page cap (all rows fit).
    expect((await listDmMessages(db, { threadId, userId: me, limit: 0 })).length).toBe(1)
    expect((await listDmMessages(db, { threadId, userId: me, limit: 9999 })).map((r) => r.ciphertext)).toEqual(['m3', 'm2', 'm1'])
    await client.close()
  })

  it('excludes thread replies from the main list and returns them oldest-first in thread mode', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const threadId = await openThread(db, me, other)
    const root = await postDmMessage(db, { threadId, userId: me, ciphertext: 'root', epoch: 1 })
    await postDmMessage(db, { threadId, userId: me, ciphertext: 't1', epoch: 1, threadRootId: root.id })
    await postDmMessage(db, { threadId, userId: me, ciphertext: 't2', epoch: 1, threadRootId: root.id })
    const main = await listDmMessages(db, { threadId, userId: me })
    expect(main.map((r) => r.ciphertext)).toEqual(['root']) // replies excluded
    const thread = await listDmMessages(db, { threadId, userId: me, thread: root.id })
    expect(thread.map((r) => r.ciphertext)).toEqual(['t1', 't2']) // oldest-first
    await client.close()
  })
})

describe('markThreadRead', () => {
  it('inserts then updates the read marker (upsert), participant-only', async () => {
    const { db, client } = await createTestDb()
    const me = await mkUser(db, 'aaa')
    const other = await mkUser(db, 'bbb')
    const stranger = await mkUser(db, 'zzz')
    const threadId = await openThread(db, me, other)
    await markThreadRead(db, threadId, me)
    const first = (await db.select().from(dmThreadRead).where(and(eq(dmThreadRead.threadId, threadId), eq(dmThreadRead.userId, me))))[0]
    await markThreadRead(db, threadId, me)
    const rows = await db.select().from(dmThreadRead).where(and(eq(dmThreadRead.threadId, threadId), eq(dmThreadRead.userId, me)))
    expect(rows).toHaveLength(1) // upsert, not a duplicate
    expect(rows[0].lastReadAt.getTime()).toBeGreaterThanOrEqual(first.lastReadAt.getTime())
    await expect(markThreadRead(db, threadId, stranger)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('searchRecipients', () => {
  it('always surfaces co-members, marks them shared, and excludes self', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const me = await mkUser(db, 'viewer')
    const mate = await mkUser(db, 'teammate')
    const leagueId = await makeLeague(db, { competitionId, ownerId: me })
    await addLeagueMember(db, leagueId, mate)
    // Empty term returns co-members only, and never the viewer themselves.
    const all = await searchRecipients(db, me, '')
    expect(all.map((r) => r.userId)).toEqual([mate])
    expect(all[0].shared).toBe(true)
    // A term filters the co-member set by name.
    expect((await searchRecipients(db, me, 'team')).map((r) => r.userId)).toEqual([mate])
    expect(await searchRecipients(db, me, 'nobody')).toEqual([])
    await client.close()
  })

  it('finds a discoverable stranger only with a term, and requires a chat identity', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const me = await mkUser(db, 'viewer')
    await makeLeague(db, { competitionId, ownerId: me }) // viewer in a league (no co-members)
    const disco = await mkUser(db, 'discoverable')
    const hidden = await mkUser(db, 'hiddenone')
    await db.update(user).set({ dmDiscoverable: false }).where(eq(user.id, hidden))
    await makeUser(db, 'noidentity') // discoverable by default, but no chat identity
    await db.update(user).set({ name: 'discoverable' }).where(eq(user.id, 'noidentity'))
    // Empty term: strangers are not offered at all.
    expect(await searchRecipients(db, me, '')).toEqual([])
    // Term: the discoverable one with an identity is returned, not-flagged as shared.
    const hits = await searchRecipients(db, me, 'discoverable')
    expect(hits.map((r) => r.userId)).toEqual([disco])
    expect(hits[0].shared).toBe(false)
    // A non-discoverable user is never surfaced to a stranger.
    expect((await searchRecipients(db, me, 'hidden')).length).toBe(0)
    await client.close()
  })

  it('de-dupes a co-member who is also discoverable, keeping the shared flag', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const me = await mkUser(db, 'viewer')
    const mate = await mkUser(db, 'sharedmate')
    const leagueId = await makeLeague(db, { competitionId, ownerId: me })
    await addLeagueMember(db, leagueId, mate) // co-member AND discoverable (default)
    const hits = await searchRecipients(db, me, 'sharedmate')
    expect(hits.filter((r) => r.userId === mate)).toHaveLength(1)
    expect(hits.find((r) => r.userId === mate)?.shared).toBe(true)
    await client.close()
  })
})
