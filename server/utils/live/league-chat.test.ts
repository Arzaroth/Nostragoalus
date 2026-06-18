import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from './hub'
import { publishChatMessage } from './league-chat'

function sub(userId: string | null): LiveSubscriber & { send: ReturnType<typeof vi.fn> } {
  return { matchIds: new Set(), userId, send: vi.fn() }
}

describe('publishChatMessage', () => {
  it('delivers the ciphertext to connected league members only', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)

    const aliceSub = sub(alice)
    const bobSub = sub(bob)
    const carolSub = sub('carol')
    const guestSub = sub(null)
    for (const s of [aliceSub, bobSub, carolSub, guestSub]) addLiveSubscriber(s)
    try {
      const message = {
        id: 'm1',
        leagueId,
        matchId: null,
        userId: alice,
        epoch: 1,
        ciphertext: 'opaque',
        createdAt: '2026-06-10T10:00:00.000Z',
      }
      const delivered = await publishChatMessage(db, message)
      expect(delivered).toBe(2)
      const expected = { type: 'chat:new', leagueId, message }
      expect(aliceSub.send).toHaveBeenCalledWith(expected)
      expect(bobSub.send).toHaveBeenCalledWith(expected)
      expect(carolSub.send).not.toHaveBeenCalled() // not a member
      expect(guestSub.send).not.toHaveBeenCalled() // guest
    } finally {
      for (const s of [aliceSub, bobSub, carolSub, guestSub]) removeLiveSubscriber(s)
      await client.close()
    }
  })
})
