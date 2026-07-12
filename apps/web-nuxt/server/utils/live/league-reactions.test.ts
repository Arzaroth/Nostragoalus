import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makeReaction, makeUser, seedCompetition } from '../../../tests/factories'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from './hub'
import { publishLeagueReactionUpdates } from './league-reactions'

function sub(userId: string | null): LiveSubscriber & { send: ReturnType<typeof vi.fn> } {
  return { matchIds: new Set(), userId, send: vi.fn() }
}

describe('publishLeagueReactionUpdates', () => {
  it('pushes league reaction counts to connected members only', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z') })
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)
    await makeReaction(db, { userId: alice, matchId: m, emoji: 'FIRE' })
    await makeReaction(db, { userId: 'carol', matchId: m, emoji: 'WOW' })

    const aliceSub = sub(alice)
    const bobSub = sub(bob)
    const carolSub = sub('carol')
    const guestSub = sub(null)
    for (const s of [aliceSub, bobSub, carolSub, guestSub]) addLiveSubscriber(s)
    try {
      const delivered = await publishLeagueReactionUpdates(db, { userId: alice, matchId: m })
      expect(delivered).toBe(2)
      const expected = {
        type: 'reaction:league-update',
        leagueId,
        matchId: m,
        // Carol reacted but is outside the league: counts cover members only.
        totals: { FIRE: 1, GOAL: 0, WOW: 0, LAUGH: 0, SAD: 0, ANGRY: 0 },
      }
      expect(aliceSub.send).toHaveBeenCalledWith(expected)
      expect(bobSub.send).toHaveBeenCalledWith(expected)
      expect(carolSub.send).not.toHaveBeenCalled()
      expect(guestSub.send).not.toHaveBeenCalled()
    } finally {
      for (const s of [aliceSub, bobSub, carolSub, guestSub]) removeLiveSubscriber(s)
    }
    await client.close()
  })

  it('no-ops for unknown matches and users without leagues', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z') })
    await makeUser(db, 'alice')
    expect(await publishLeagueReactionUpdates(db, { userId: 'alice', matchId: 'missing' })).toBe(0)
    expect(await publishLeagueReactionUpdates(db, { userId: 'alice', matchId: m })).toBe(0)
    await client.close()
  })
})
