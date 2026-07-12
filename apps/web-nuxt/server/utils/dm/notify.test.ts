import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { userNotification } from '../../../db/schema'
import { notifyDm } from './notify'

describe('notifyDm', () => {
  it('creates a DM_MESSAGE notification for the recipient carrying the thread + sender name', async () => {
    const { db, client } = await createTestDb()
    const sender = await makeUser(db, 'sender', 'Alice')
    const recipient = await makeUser(db, 'recipient', 'Bob')
    const created = await notifyDm(db, { threadId: 'thread-1', senderId: sender, recipientId: recipient })
    expect(created).toBe(true)
    const rows = await db.select().from(userNotification).where(eq(userNotification.userId, recipient))
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('DM_MESSAGE')
    expect(rows[0].data).toMatchObject({ type: 'DM_MESSAGE', threadId: 'thread-1', senderId: sender, senderName: 'Alice' })
    expect(rows[0].dedupeKey).toBe('dm-thread:thread-1')
    await client.close()
  })

  it('groups by thread: a second message in the same thread resurfaces the one row unread, not a new one', async () => {
    const { db, client } = await createTestDb()
    const sender = await makeUser(db, 'sender', 'Alice')
    const recipient = await makeUser(db, 'recipient', 'Bob')
    expect(await notifyDm(db, { threadId: 'thread-1', senderId: sender, recipientId: recipient })).toBe(true)
    // Mark it read, then a new message in the same thread should bump it back to unread.
    await db.update(userNotification).set({ readAt: new Date() }).where(eq(userNotification.userId, recipient))
    expect(await notifyDm(db, { threadId: 'thread-1', senderId: sender, recipientId: recipient })).toBe(true)
    const rows = await db.select().from(userNotification).where(eq(userNotification.userId, recipient))
    expect(rows).toHaveLength(1)
    expect(rows[0].readAt).toBeNull()
    await client.close()
  })

  it('keeps a separate row per thread so distinct conversations stay distinct', async () => {
    const { db, client } = await createTestDb()
    const sender = await makeUser(db, 'sender', 'Alice')
    const recipient = await makeUser(db, 'recipient', 'Bob')
    await notifyDm(db, { threadId: 'thread-1', senderId: sender, recipientId: recipient })
    await notifyDm(db, { threadId: 'thread-2', senderId: sender, recipientId: recipient })
    const rows = await db.select().from(userNotification).where(eq(userNotification.userId, recipient))
    expect(rows).toHaveLength(2)
    await client.close()
  })
})
