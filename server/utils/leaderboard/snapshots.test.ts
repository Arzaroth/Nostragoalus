import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getLeagueRankMovements, getRankMovements, updateLeagueRankSnapshots, updateRankSnapshots } from './snapshots'
import { prediction, user } from '../../../db/schema'
import { removeMembership } from '../leagues/service'

async function score(db: TestDb, predId: string, totalPoints: number) {
  await db
    .update(prediction)
    .set({ totalPoints, baseTier: 'EXACT', scoredAt: new Date(), scoredAtVersion: 1 })
    .where(eq(prediction.id, predId))
}

describe('rank snapshots', () => {
  it('records movement when ranks change and keeps arrows on re-runs', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const alice = await makeUser(db, 'alice', 'Alice')
    const bob = await makeUser(db, 'bob', 'Bob')
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-12T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0 })

    await score(db, await makePrediction(db, { userId: alice, matchId: m1, roundId, home: 1, away: 0, lockedAt: new Date() }), 3)
    await score(db, await makePrediction(db, { userId: bob, matchId: m1, roundId, home: 1, away: 0, lockedAt: new Date() }), 1)

    // First snapshot just records ranks - no movement yet.
    await updateRankSnapshots(db, competitionId)
    expect((await getRankMovements(db, competitionId)).size).toBe(0)

    // Bob overtakes Alice.
    await score(db, await makePrediction(db, { userId: bob, matchId: m2, roundId, home: 2, away: 0, lockedAt: new Date() }), 5)
    await updateRankSnapshots(db, competitionId)

    const moves = await getRankMovements(db, competitionId)
    expect(moves.get(bob)).toBe(1)
    expect(moves.get(alice)).toBe(-1)

    // Re-running without rank changes keeps the arrows (no churn).
    await updateRankSnapshots(db, competitionId)
    expect((await getRankMovements(db, competitionId)).get(bob)).toBe(1)
    await client.close()
  })
  it('no-ops on an empty board (no users) without writing snapshots', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await updateRankSnapshots(db, competitionId)
    expect((await getRankMovements(db, competitionId)).size).toBe(0)
    await client.close()
  })
})

describe('league rank snapshots', () => {
  it('tracks within-league movement, including private members, per league', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const alice = await makeUser(db, 'alice', 'Alice')
    const bob = await makeUser(db, 'bob', 'Bob')
    const carol = await makeUser(db, 'carol', 'Carol')
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, bob))
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)
    // Carol outranks everyone globally but is not in the league.
    const otherLeague = await makeLeague(db, { competitionId, ownerId: carol })
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-12T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0 })
    await score(db, await makePrediction(db, { userId: carol, matchId: m1, roundId, home: 1, away: 0, lockedAt: new Date() }), 9)
    await score(db, await makePrediction(db, { userId: alice, matchId: m1, roundId, home: 1, away: 0, lockedAt: new Date() }), 3)
    await score(db, await makePrediction(db, { userId: bob, matchId: m1, roundId, home: 1, away: 0, lockedAt: new Date() }), 1)

    await updateLeagueRankSnapshots(db, competitionId)
    expect((await getLeagueRankMovements(db, leagueId)).size).toBe(0)

    // Bob (private profile) overtakes Alice inside the league.
    await score(db, await makePrediction(db, { userId: bob, matchId: m2, roundId, home: 2, away: 0, lockedAt: new Date() }), 5)
    await updateLeagueRankSnapshots(db, competitionId)
    const moves = await getLeagueRankMovements(db, leagueId)
    expect(moves.get(bob)).toBe(1)
    expect(moves.get(alice)).toBe(-1)
    // Carol's league is untouched by the other league's churn.
    expect((await getLeagueRankMovements(db, otherLeague)).size).toBe(0)
    await client.close()
  })

  it('membership removal clears the snapshot so a re-join starts fresh', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const alice = await makeUser(db, 'alice', 'Alice')
    const bob = await makeUser(db, 'bob', 'Bob')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)
    await updateLeagueRankSnapshots(db, competitionId)
    await removeMembership(db, leagueId, bob)
    await addLeagueMember(db, leagueId, bob)
    await updateLeagueRankSnapshots(db, competitionId)
    // Fresh snapshot row: no movement for the re-joined member.
    expect((await getLeagueRankMovements(db, leagueId)).get(bob)).toBeUndefined()
    await client.close()
  })
})
