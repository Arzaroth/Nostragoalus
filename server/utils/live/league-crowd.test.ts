import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from './hub'
import { publishLeagueCrowdUpdates } from './league-crowd'

function sub(userId: string | null): LiveSubscriber & { send: ReturnType<typeof vi.fn> } {
  return { matchIds: new Set(), userId, send: vi.fn() }
}

describe('publishLeagueCrowdUpdates', () => {
  it('pushes league totals to connected members only', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z') })
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)
    await makePrediction(db, { userId: alice, matchId: m, roundId, home: 2, away: 1 })
    await makePrediction(db, { userId: 'carol', matchId: m, roundId, home: 4, away: 0 })

    const aliceSub = sub(alice)
    const bobSub = sub(bob)
    const carolSub = sub('carol')
    const guestSub = sub(null)
    for (const s of [aliceSub, bobSub, carolSub, guestSub]) addLiveSubscriber(s)
    try {
      const delivered = await publishLeagueCrowdUpdates(db, { userId: alice, matchId: m })
      expect(delivered).toBe(2)
      const expected = {
        type: 'crowd:update',
        leagueId,
        matchId: m,
        // Carol's prediction is outside the league: totals cover members only.
        totals: { home: 2, away: 1, count: 1 },
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

  it('one push per league of the predictor, leagues of other competitions excluded', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const otherCompetition = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z') })
    const alice = await makeUser(db, 'alice')
    const l1 = await makeLeague(db, { competitionId, ownerId: alice })
    const l2 = await makeLeague(db, { competitionId, ownerId: alice })
    await makeLeague(db, { competitionId: otherCompetition, ownerId: alice })
    await makePrediction(db, { userId: alice, matchId: m, roundId, home: 1, away: 1 })

    const aliceSub = sub(alice)
    addLiveSubscriber(aliceSub)
    try {
      expect(await publishLeagueCrowdUpdates(db, { userId: alice, matchId: m })).toBe(2)
      const leagueIds = aliceSub.send.mock.calls.map((c) => (c[0] as { leagueId: string }).leagueId).sort()
      expect(leagueIds).toEqual([l1, l2].sort())
    } finally {
      removeLiveSubscriber(aliceSub)
    }
    await client.close()
  })

  it('no-ops for unknown matches and users without leagues', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z') })
    await makeUser(db, 'alice')
    expect(await publishLeagueCrowdUpdates(db, { userId: 'alice', matchId: 'missing' })).toBe(0)
    expect(await publishLeagueCrowdUpdates(db, { userId: 'alice', matchId: m })).toBe(0)
    await client.close()
  })
})
