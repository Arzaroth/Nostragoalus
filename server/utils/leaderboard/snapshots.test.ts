import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getRankMovements, updateRankSnapshots } from './snapshots'
import { prediction } from '../../../db/schema'

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
})
