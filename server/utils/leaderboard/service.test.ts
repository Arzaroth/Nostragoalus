import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { compareLeaderboardRows, getLeaderboard } from './service'
import { bestScorerPick, championPick, prediction, user } from '../../../db/schema'

describe('compareLeaderboardRows', () => {
  const base = { totalPoints: 0, exactCount: 0, outcomeCount: 0, gdCount: 0, joinedAt: new Date('2026-01-01'), userId: 'a' }
  it('applies each tie-break level in order', () => {
    expect(compareLeaderboardRows({ ...base, totalPoints: 1 }, { ...base, totalPoints: 2 })).toBeGreaterThan(0)
    expect(compareLeaderboardRows({ ...base, exactCount: 2 }, { ...base, exactCount: 1 })).toBeLessThan(0)
    expect(compareLeaderboardRows({ ...base, outcomeCount: 2 }, { ...base, outcomeCount: 1 })).toBeLessThan(0)
    expect(compareLeaderboardRows({ ...base, gdCount: 2 }, { ...base, gdCount: 1 })).toBeLessThan(0)
    expect(compareLeaderboardRows({ ...base, joinedAt: new Date('2026-01-01') }, { ...base, joinedAt: new Date('2026-02-01') })).toBeLessThan(0)
    expect(compareLeaderboardRows({ ...base, joinedAt: new Date('2026-03-01') }, { ...base, joinedAt: new Date('2026-02-01') })).toBeGreaterThan(0)
    expect(compareLeaderboardRows({ ...base, userId: 'a' }, { ...base, userId: 'b' })).toBeLessThan(0)
    expect(compareLeaderboardRows({ ...base, userId: 'b' }, { ...base, userId: 'a' })).toBeGreaterThan(0)
    expect(compareLeaderboardRows({ ...base }, { ...base })).toBe(0)
  })
})

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

  it('ranks provisionally by scored + live, but displays scored points and the live delta', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const high = await makeUser(db, 'high', 'High') // 3 scored, no live
    const low = await makeUser(db, 'low', 'Low') // 1 scored, +5 live
    await score(db, await makePrediction(db, { userId: high, matchId: m, roundId, home: 1, away: 0, lockedAt: new Date() }), 3, 'EXACT')
    await score(db, await makePrediction(db, { userId: low, matchId: m, roundId, home: 1, away: 1, lockedAt: new Date() }), 1, 'OUTCOME')

    const liveProvisional = new Map([[low, { points: 5, exact: 1, outcome: 1, gd: 1 }]])
    const board = await getLeaderboard(db, { competitionId, liveProvisional })
    // Low ranks first on provisional 1+5=6 vs High's 3...
    expect(board.map((r) => r.displayName)).toEqual(['Low', 'High'])
    // ...but the displayed total stays scored, with the live points as a delta.
    expect(board[0]).toMatchObject({ displayName: 'Low', rank: 1, totalPoints: 1, livePoints: 5 })
    expect(board[1]).toMatchObject({ displayName: 'High', rank: 2, totalPoints: 3, livePoints: 0 })
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

  it('aggregates across all competitions for the global ranking (incl. champions)', async () => {
    const { db, client } = await createTestDb()
    const c1 = await seedCompetition(db)
    const c2 = await seedCompetition(db)
    const r1 = (await findRoundId(db, c1, 'GROUP', 1)) as string
    const r2 = (await findRoundId(db, c2, 'GROUP', 1)) as string
    const u = await makeUser(db, 'u', 'U')
    const m1 = await makeMatch(db, { competitionId: c1, roundId: r1, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const m2 = await makeMatch(db, { competitionId: c2, roundId: r2, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await score(db, await makePrediction(db, { userId: u, matchId: m1, roundId: r1, home: 1, away: 0, lockedAt: new Date() }), 3, 'EXACT')
    await score(db, await makePrediction(db, { userId: u, matchId: m2, roundId: r2, home: 1, away: 0, lockedAt: new Date() }), 2, 'DIFF')
    await db.insert(championPick).values({ userId: u, competitionId: c1, teamCode: 'A', teamName: 'A', awardedPoints: 10 })
    await db.insert(championPick).values({ userId: u, competitionId: c2, teamCode: 'B', teamName: 'B', awardedPoints: 5 })
    await db.insert(bestScorerPick).values({ userId: u, competitionId: c1, playerId: 'p1', playerName: 'P One', teamCode: 'A', teamName: 'A', awardedPoints: 4 })
    await db.insert(bestScorerPick).values({ userId: u, competitionId: c2, playerId: 'p2', playerName: 'P Two', teamCode: 'B', teamName: 'B', awardedPoints: 6 })

    const board = await getLeaderboard(db, { competitionId: null })
    expect(board[0]).toMatchObject({ totalPoints: 30, predictionPoints: 5, championPoints: 15, bestScorerPoints: 10, bestScorerName: null })
    await client.close()
  })

  it('paginates with offset-based ranks', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const a = await makeUser(db, 'a', 'A')
    await makeUser(db, 'b', 'B')
    // Distinct points so the two users hold distinct ranks (1, 2).
    await db.insert(championPick).values({ userId: a, competitionId, teamCode: 'A', teamName: 'A', awardedPoints: 10 })
    const page = await getLeaderboard(db, { competitionId, limit: 1, offset: 1 })
    expect(page).toHaveLength(1)
    expect(page[0].rank).toBe(2)
    await client.close()
  })

  it('gives players tied on the whole ladder the same rank, and skips the gap', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    // Two players with identical scoring (same exact pick), one player behind.
    const ann = await makeUser(db, 'ann', 'Ann')
    const ben = await makeUser(db, 'ben', 'Ben')
    await makeUser(db, 'cat', 'Cat')
    await score(db, await makePrediction(db, { userId: ann, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() }), 3, 'EXACT')
    await score(db, await makePrediction(db, { userId: ben, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() }), 3, 'EXACT')

    const board = await getLeaderboard(db, { competitionId })
    // Ann and Ben tie at rank 1; Cat (0 points) is rank 3, not 2.
    expect(board.map((r) => r.rank)).toEqual([1, 1, 3])
    expect(board.map((r) => r.totalPoints)).toEqual([3, 3, 0])
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

  it('includes the best-scorer bonus in the total and ranking', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const a = await makeUser(db, 'a', 'A')
    await makeUser(db, 'b', 'B')
    await db.insert(bestScorerPick).values({ userId: a, competitionId, playerId: 'p-mbappe', playerName: 'Kylian MBAPPE', teamCode: 'FRA', teamName: 'France', awardedPoints: 10 })

    const board = await getLeaderboard(db, { competitionId })
    expect(board[0]).toMatchObject({ userId: a, totalPoints: 10, bestScorerPoints: 10, bestScorerName: 'Kylian MBAPPE', predictionPoints: 0 })
    expect(board[1]).toMatchObject({ totalPoints: 0, bestScorerPoints: 0, bestScorerName: null })
    await client.close()
  })

  it('excludes hidden users unless includeHidden is set', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await makeUser(db, 'alice', 'Alice')
    const ghost = await makeUser(db, 'ghost', 'Ghost')
    await db.update(user).set({ hiddenFromLeaderboard: true }).where(eq(user.id, ghost))

    const board = await getLeaderboard(db, { competitionId })
    expect(board.map((r) => r.displayName)).toEqual(['Alice'])

    const full = await getLeaderboard(db, { competitionId, includeHidden: true })
    expect(full.map((r) => r.displayName).sort()).toEqual(['Alice', 'Ghost'])
    await client.close()
  })

  it('league scope ranks only members, with contiguous ranks and champion bonus', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    const alice = await makeUser(db, 'alice', 'Alice')
    const bob = await makeUser(db, 'bob', 'Bob')
    const carol = await makeUser(db, 'carol', 'Carol')
    // Carol outscores everyone but is not in the league.
    await score(db, await makePrediction(db, { userId: carol, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() }), 9, 'EXACT')
    await score(db, await makePrediction(db, { userId: alice, matchId: m, roundId, home: 2, away: 1, lockedAt: new Date() }), 3, 'EXACT')
    await db.insert(championPick).values({ userId: bob, competitionId, teamCode: 'MEX', teamName: 'Mexico', awardedPoints: 10 })
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob)

    const board = await getLeaderboard(db, { competitionId, leagueId })
    expect(board.map((r) => r.displayName)).toEqual(['Bob', 'Alice'])
    expect(board.map((r) => r.rank)).toEqual([1, 2])
    expect(board[0]).toMatchObject({ championPoints: 10, totalPoints: 10 })
    expect(board[1]).toMatchObject({ predictionPoints: 3, totalPoints: 3 })
    await client.close()
  })

  it('league scope still excludes hidden users and ignores other competitions', async () => {
    const { db, client } = await createTestDb()
    const c1 = await seedCompetition(db)
    const c2 = await seedCompetition(db)
    const r2 = (await findRoundId(db, c2, 'GROUP', 1)) as string
    const alice = await makeUser(db, 'alice', 'Alice')
    const ghost = await makeUser(db, 'ghost', 'Ghost')
    await db.update(user).set({ hiddenFromLeaderboard: true }).where(eq(user.id, ghost))
    // Points in c2 must not leak into a c1 league board.
    const m2 = await makeMatch(db, { competitionId: c2, roundId: r2, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await score(db, await makePrediction(db, { userId: alice, matchId: m2, roundId: r2, home: 1, away: 0, lockedAt: new Date() }), 3, 'EXACT')
    const leagueId = await makeLeague(db, { competitionId: c1, ownerId: alice })
    await addLeagueMember(db, leagueId, ghost)

    const board = await getLeaderboard(db, { competitionId: c1, leagueId })
    expect(board.map((r) => r.displayName)).toEqual(['Alice'])
    expect(board[0].totalPoints).toBe(0)
    await client.close()
  })

  it('excludes private users from public boards, includes them for league mates', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await makeUser(db, 'alice', 'Alice')
    const recluse = await makeUser(db, 'recluse', 'Recluse')
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, recluse))
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, leagueId, recluse)

    // Public boards: opted out.
    expect((await getLeaderboard(db, { competitionId })).map((r) => r.displayName)).toEqual(['Alice'])
    expect((await getLeaderboard(db, { competitionId: null })).map((r) => r.displayName)).toEqual(['Alice'])
    // Self-stats path still sees them.
    const all = await getLeaderboard(db, { competitionId, includeHidden: true, includePrivate: true })
    expect(all.map((r) => r.displayName).sort()).toEqual(['Alice', 'Recluse'])
    // League board: member viewer (includePrivate) sees them, outsider does not.
    expect((await getLeaderboard(db, { competitionId, leagueId, includePrivate: true })).map((r) => r.displayName)).toEqual(['Alice', 'Recluse'])
    expect((await getLeaderboard(db, { competitionId, leagueId })).map((r) => r.displayName)).toEqual(['Alice'])
    // alwaysIncludeUserId keeps the caller on an otherwise-exclusive board:
    // the private caller appears, other private users still don't (me/stats).
    const selfView = await getLeaderboard(db, { competitionId, alwaysIncludeUserId: recluse })
    expect(selfView.map((r) => r.displayName).sort()).toEqual(['Alice', 'Recluse'])
    await client.close()
  })

  it('league scope paginates with offset-based ranks', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const a = await makeUser(db, 'a', 'A')
    const b = await makeUser(db, 'b', 'B')
    await makeUser(db, 'c', 'C')
    const leagueId = await makeLeague(db, { competitionId, ownerId: a })
    await addLeagueMember(db, leagueId, b)
    // Distinct points so the members hold distinct ranks (1, 2).
    await db.insert(championPick).values({ userId: a, competitionId, teamCode: 'A', teamName: 'A', awardedPoints: 10 })
    const page = await getLeaderboard(db, { competitionId, leagueId, limit: 1, offset: 1 })
    expect(page).toHaveLength(1)
    expect(page[0].rank).toBe(2)
    await client.close()
  })
})
