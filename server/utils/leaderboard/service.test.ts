import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getLeaderboard } from './service'
import { championPick, prediction } from '../../../db/schema'

async function score(db: TestDb, predId: string, totalPoints: number, baseTier: 'EXACT' | 'DIFF' | 'OUTCOME' | 'MISS') {
  await db
    .update(prediction)
    .set({ totalPoints, baseTier, scoredAt: new Date(), scoredAtVersion: 1 })
    .where(eq(prediction.id, predId))
}

describe('getLeaderboard', () => {
  it('ranks by points then tie-breaks, including zero-prediction users', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })

    const alice = await makeUser(db, 'alice', 'Alice')
    const bob = await makeUser(db, 'bob', 'Bob')
    await makeUser(db, 'carol', 'Carol')

    const aP = await makePrediction(db, { userId: alice, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() })
    const bP = await makePrediction(db, { userId: bob, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() })
    await score(db, aP, 3, 'EXACT')
    await score(db, bP, 3, 'OUTCOME')

    const board = await getLeaderboard(db, { competitionId })
    expect(board.map((r) => r.displayName)).toEqual(['Alice', 'Bob', 'Carol'])
    expect(board[0]).toMatchObject({ rank: 1, totalPoints: 3, exactCount: 1 })
    expect(board[1]).toMatchObject({ rank: 2, totalPoints: 3, exactCount: 0, outcomeCount: 1 })
    expect(board[2]).toMatchObject({ rank: 3, totalPoints: 0 })
    await client.close()
  })

  it('only counts points from the requested competition', async () => {
    const { db, client } = await createTestDb()
    const c1 = await seedCompetition(db)
    const c2 = await seedCompetition(db)
    const r1 = (await findRoundId(db, c1, 'GROUP', 1)) as string
    const r2 = (await findRoundId(db, c2, 'GROUP', 1)) as string
    const u = await makeUser(db, 'u', 'U')
    const m1 = await makeMatch(db, { competitionId: c1, roundId: r1, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const m2 = await makeMatch(db, { competitionId: c2, roundId: r2, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await score(db, await makePrediction(db, { userId: u, matchId: m1, roundId: r1, home: 1, away: 0, lockedAt: new Date() }), 3, 'EXACT')
    await score(db, await makePrediction(db, { userId: u, matchId: m2, roundId: r2, home: 1, away: 0, lockedAt: new Date() }), 3, 'EXACT')

    expect((await getLeaderboard(db, { competitionId: c1 }))[0].totalPoints).toBe(3)
    expect((await getLeaderboard(db, { competitionId: c2 }))[0].totalPoints).toBe(3)
    await client.close()
  })

  it('paginates with offset-based ranks', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await makeUser(db, 'a', 'A')
    await makeUser(db, 'b', 'B')
    const page = await getLeaderboard(db, { competitionId, limit: 1, offset: 1 })
    expect(page).toHaveLength(1)
    expect(page[0].rank).toBe(2)
    await client.close()
  })

  it('includes the champion-pick bonus in the total and ranking', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const a = await makeUser(db, 'a', 'A')
    await makeUser(db, 'b', 'B')
    await db.insert(championPick).values({ userId: a, competitionId, teamCode: 'MEX', teamName: 'Mexico', awardedPoints: 10 })

    const board = await getLeaderboard(db, { competitionId })
    expect(board[0]).toMatchObject({ userId: a, totalPoints: 10, championPoints: 10, predictionPoints: 0 })
    expect(board[1]).toMatchObject({ totalPoints: 0 })
    await client.close()
  })
})
