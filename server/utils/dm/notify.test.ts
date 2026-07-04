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
    const created = await notifyDm(db, { threadId: 'thread-1', messageId: 'msg-1', senderId: sender, recipientId: recipient })
    expect(created).toBe(true)
    const rows = await db.select().from(userNotification).where(eq(userNotification.userId, recipient))
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('DM_MESSAGE')
    expect(rows[0].data).toMatchObject({ type: 'DM_MESSAGE', threadId: 'thread-1', senderId: sender, senderName: 'Alice' })
    await client.close()
  })

  it('dedupes on the message id: a re-delivery is a no-op returning false', async () => {
    const { db, client } = await createTestDb()
    const sender = await makeUser(db, 'sender', 'Alice')
    const recipient = await makeUser(db, 'recipient', 'Bob')
    expect(await notifyDm(db, { threadId: 'thread-1', messageId: 'msg-1', senderId: sender, recipientId: recipient })).toBe(true)
    expect(await notifyDm(db, { threadId: 'thread-1', messageId: 'msg-1', senderId: sender, recipientId: recipient })).toBe(false)
    const rows = await db.select().from(userNotification).where(eq(userNotification.userId, recipient))
    expect(rows).toHaveLength(1)
    await client.close()
  })
})
