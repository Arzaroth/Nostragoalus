import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { ensureRounds, findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser } from '../../../tests/factories'
import { getLeaderboard } from './service'
import { prediction } from '../../../db/schema'
import type { TestDb } from '../../../tests/db'

async function score(db: TestDb, predId: string, totalPoints: number, baseTier: 'EXACT' | 'DIFF' | 'OUTCOME' | 'MISS') {
  await db
    .update(prediction)
    .set({ totalPoints, baseTier, scoredAt: new Date(), scoredAtVersion: 1 })
    .where(eq(prediction.id, predId))
}

describe('getLeaderboard', () => {
  it('ranks by points then tie-breaks, and includes zero-prediction users', async () => {
    const { db, client } = await createTestDb()
    await ensureRounds(db)
    const roundId = (await findRoundId(db, 'GROUP', 1)) as string
    const m = await makeMatch(db, { roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })

    const alice = await makeUser(db, 'alice', 'Alice')
    const bob = await makeUser(db, 'bob', 'Bob')
    await makeUser(db, 'carol', 'Carol')

    const aP = await makePrediction(db, { userId: alice, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() })
    const bP = await makePrediction(db, { userId: bob, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() })
    await score(db, aP, 3, 'EXACT')
    await score(db, bP, 3, 'OUTCOME')

    const board = await getLeaderboard(db)
    expect(board.map((r) => r.displayName)).toEqual(['Alice', 'Bob', 'Carol'])
    expect(board[0]).toMatchObject({ rank: 1, totalPoints: 3, exactCount: 1 })
    expect(board[1]).toMatchObject({ rank: 2, totalPoints: 3, exactCount: 0, outcomeCount: 1 })
    expect(board[2]).toMatchObject({ rank: 3, totalPoints: 0 })
    await client.close()
  })

  it('paginates with offset-based ranks', async () => {
    const { db, client } = await createTestDb()
    await makeUser(db, 'a', 'A')
    await makeUser(db, 'b', 'B')
    const page = await getLeaderboard(db, { limit: 1, offset: 1 })
    expect(page).toHaveLength(1)
    expect(page[0].rank).toBe(2)
    await client.close()
  })
})
