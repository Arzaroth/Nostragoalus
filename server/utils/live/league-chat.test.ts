import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from './hub'
import { chatMessage } from '../../../db/schema'
import { setChatReaction } from '../chat/reactions'
import { emptyReactionTotals } from '../../../shared/reactions'
import { publishChatMessage, publishChatReaction, publishKeysAdded, publishModeration, publishRekeyRequest, publishStateChanged } from './league-chat'

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

describe('publishRekeyRequest', () => {
  it('broadcasts a keyless rekey prompt to the league members only', async () => {
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
    for (const s of [aliceSub, bobSub, carolSub]) addLiveSubscriber(s)
    try {
      expect(await publishRekeyRequest(db, leagueId)).toBe(2)
      const expected = { type: 'chat:rekey-request', leagueId }
      expect(aliceSub.send).toHaveBeenCalledWith(expected)
      expect(bobSub.send).toHaveBeenCalledWith(expected)
      expect(carolSub.send).not.toHaveBeenCalled() // not a member
    } finally {
      for (const s of [aliceSub, bobSub, carolSub]) removeLiveSubscriber(s)
      await client.close()
    }
  })
})

describe('publishKeysAdded', () => {
  it('tells the named recipients to reload', () => {
    const newcomer = sub('newcomer')
    const other = sub('other')
    for (const s of [newcomer, other]) addLiveSubscriber(s)
    try {
      expect(publishKeysAdded('lg', ['newcomer'])).toBe(1)
      expect(newcomer.send).toHaveBeenCalledWith({ type: 'chat:keys-added', leagueId: 'lg' })
      expect(other.send).not.toHaveBeenCalled()
    } finally {
      for (const s of [newcomer, other]) removeLiveSubscriber(s)
    }
  })
})

describe('publishStateChanged', () => {
  it('nudges the league members to reload', async () => {
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
    for (const s of [aliceSub, bobSub, carolSub]) addLiveSubscriber(s)
    try {
      expect(await publishStateChanged(db, leagueId)).toBe(2)
      const expected = { type: 'chat:state-changed', leagueId }
      expect(aliceSub.send).toHaveBeenCalledWith(expected)
      expect(bobSub.send).toHaveBeenCalledWith(expected)
      expect(carolSub.send).not.toHaveBeenCalled()
    } finally {
      for (const s of [aliceSub, bobSub, carolSub]) removeLiveSubscriber(s)
      await client.close()
    }
  })
})

describe('publishChatReaction', () => {
  it('pushes a message fresh totals to the league members', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)
    const [{ id: messageId }] = await db.insert(chatMessage).values({ leagueId, userId: alice, epoch: 1, ciphertext: 'c' }).returning({ id: chatMessage.id })
    await setChatReaction(db, { leagueId, messageId, userId: alice, emoji: 'WOW' })

    const aliceSub = sub(alice)
    const bobSub = sub(bob)
    for (const s of [aliceSub, bobSub]) addLiveSubscriber(s)
    try {
      expect(await publishChatReaction(db, leagueId, messageId)).toBe(2)
      const expected = { type: 'chat:reaction', leagueId, messageId, totals: { ...emptyReactionTotals(), WOW: 1 } }
      expect(aliceSub.send).toHaveBeenCalledWith(expected)
      expect(bobSub.send).toHaveBeenCalledWith(expected)
    } finally {
      for (const s of [aliceSub, bobSub] as const) removeLiveSubscriber(s)
      await client.close()
    }
  })
})

describe('publishModeration', () => {
  it('pushes the new message state to the league members', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)

    const aliceSub = sub(alice)
    const bobSub = sub(bob)
    for (const s of [aliceSub, bobSub] as const) addLiveSubscriber(s)
    try {
      expect(await publishModeration(db, leagueId, 'msg1', 'PENDING')).toBe(2)
      const expected = { type: 'chat:moderation', leagueId, messageId: 'msg1', state: 'PENDING' }
      expect(aliceSub.send).toHaveBeenCalledWith(expected)
      expect(bobSub.send).toHaveBeenCalledWith(expected)
    } finally {
      for (const s of [aliceSub, bobSub] as const) removeLiveSubscriber(s)
      await client.close()
    }
  })
})
