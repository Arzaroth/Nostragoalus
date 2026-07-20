import { describe, it, expect, vi } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { chatIdentity } from '../../../db/schema'
import { createThread } from '../dm/service'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from './hub'
import { publishDmTypingHint } from './dm-chat'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']

function sub(userId: string | null): LiveSubscriber & { send: ReturnType<typeof vi.fn> } {
  return { matchIds: new Set(), userId, send: vi.fn() }
}

async function mkUser(db: Db, id: string): Promise<string> {
  await makeUser(db, id)
  await db.insert(chatIdentity).values({ userId: id, publicKey: `pk-${id}` })
  return id
}

describe('publishDmTypingHint', () => {
  it('tells the other participant, never the typer and never a stranger', async () => {
    const { db, client } = await createTestDb()
    const alice = await mkUser(db, 'alice')
    const bob = await mkUser(db, 'bob')
    const carol = await mkUser(db, 'carol')
    const { threadId } = await createThread(db, {
      userId: alice,
      recipientId: bob,
      wraps: [
        { userId: alice, wrappedKey: 'wk-a' },
        { userId: bob, wrappedKey: 'wk-b' },
      ],
    })

    const aliceSub = sub(alice)
    const bobSub = sub(bob)
    const carolSub = sub(carol)
    for (const s of [aliceSub, bobSub, carolSub]) addLiveSubscriber(s)
    try {
      expect(await publishDmTypingHint(db, { threadId, userId: alice, nowMs: 1000 })).toBe(true)
      expect(bobSub.send).toHaveBeenCalledWith({ type: 'dm:typing', threadId, userId: alice })
      expect(aliceSub.send).not.toHaveBeenCalled()
      expect(carolSub.send).not.toHaveBeenCalled()

      // A non-participant cannot signal into the thread, even once the pair is
      // cached, and gets nothing back.
      expect(await publishDmTypingHint(db, { threadId, userId: carol, nowMs: 2000 })).toBe(false)
      expect(carolSub.send).not.toHaveBeenCalled()
      expect(bobSub.send).toHaveBeenCalledTimes(1)

      // The reply direction works off the same cached pair.
      expect(await publishDmTypingHint(db, { threadId, userId: bob, nowMs: 3000 })).toBe(true)
      expect(aliceSub.send).toHaveBeenCalledWith({ type: 'dm:typing', threadId, userId: bob })

      // Past the cache TTL the pair is reloaded and delivery still works.
      expect(await publishDmTypingHint(db, { threadId, userId: alice, nowMs: 1_000_000 })).toBe(true)
      expect(bobSub.send).toHaveBeenCalledTimes(2)
    } finally {
      for (const s of [aliceSub, bobSub, carolSub]) removeLiveSubscriber(s)
      await client.close()
    }
  })

  it('is a no-op for a thread that does not exist', async () => {
    const { db, client } = await createTestDb()
    const alice = await mkUser(db, 'alice')
    const aliceSub = sub(alice)
    addLiveSubscriber(aliceSub)
    try {
      expect(await publishDmTypingHint(db, { threadId: 'nope', userId: alice, nowMs: 1000 })).toBe(false)
      expect(aliceSub.send).not.toHaveBeenCalled()
    } finally {
      removeLiveSubscriber(aliceSub)
      await client.close()
    }
  })

  it('lets a real database failure surface instead of reading as "not a participant"', async () => {
    const boom = new Error('db down')
    const db = {
      select: () => {
        throw boom
      },
    } as unknown as AppDatabase
    await expect(publishDmTypingHint(db, { threadId: 'unseen', userId: 'a', nowMs: 5000 })).rejects.toBe(boom)
  })
})
