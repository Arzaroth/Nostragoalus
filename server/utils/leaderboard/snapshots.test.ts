import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getLeagueRankSnapshots, getRankSnapshots, rankMovement, updateLeagueRankSnapshots, updateRankSnapshots } from './snapshots'
import { leaderboardRank, prediction, user } from '../../../db/schema'
import { removeMembership } from '../leagues/service'

async function score(db: TestDb, predId: string, totalPoints: number) {
  await db
    .update(prediction)
    .set({ totalPoints, baseTier: 'EXACT', scoredAt: new Date(), scoredAtVersion: 1 })
    .where(eq(prediction.id, predId))
}

describe('rankMovement', () => {
  it('keys off the displayed rank, with a settled or live baseline', () => {
    // No snapshot, or no prior rank, or no change -> no arrow.
    expect(rankMovement(undefined, 5, false)).toBeNull()
    expect(rankMovement(undefined, 5, true)).toBeNull()
    expect(rankMovement({ rank: 5, prevRank: null }, 5, false)).toBeNull()
    expect(rankMovement({ rank: 5, prevRank: 5 }, 5, false)).toBeNull()
    // Settled board: baseline is the rank before this round.
    expect(rankMovement({ rank: 3, prevRank: 7 }, 3, false)).toBe(4)
    // Live board: baseline is the last settled rank, measured against the live
    // displayed rank - so a live slip from 5 to 8 reads as a three-place drop.
    expect(rankMovement({ rank: 5, prevRank: null }, 8, true)).toBe(-3)
    expect(rankMovement({ rank: 5, prevRank: 2 }, 5, true)).toBeNull()
  })
})

describe('rank snapshots', () => {
  it('records round movement, clears it when a rank is unchanged, and is live-aware', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const alice = await makeUser(db, 'alice', 'Alice')
    const bob = await makeUser(db, 'bob', 'Bob')
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-12T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0 })

    await score(db, await makePrediction(db, { userId: alice, matchId: m1, roundId, home: 1, away: 0, lockedAt: new Date() }), 3)
    await score(db, await makePrediction(db, { userId: bob, matchId: m1, roundId, home: 1, away: 0, lockedAt: new Date() }), 1)

    // First snapshot just records ranks - prevRank is null, so no movement yet.
    await updateRankSnapshots(db, competitionId)
    let snaps = await getRankSnapshots(db, competitionId)
    expect(rankMovement(snaps.get(alice), snaps.get(alice)!.rank, false)).toBeNull()

    // Bob overtakes Alice.
    await score(db, await makePrediction(db, { userId: bob, matchId: m2, roundId, home: 2, away: 0, lockedAt: new Date() }), 5)
    await updateRankSnapshots(db, competitionId)
    snaps = await getRankSnapshots(db, competitionId)
    expect(rankMovement(snaps.get(bob), snaps.get(bob)!.rank, false)).toBe(1)
    expect(rankMovement(snaps.get(alice), snaps.get(alice)!.rank, false)).toBe(-1)

    // Re-running without a rank change clears the arrow (no stale movement).
    await updateRankSnapshots(db, competitionId)
    snaps = await getRankSnapshots(db, competitionId)
    expect(rankMovement(snaps.get(bob), snaps.get(bob)!.rank, false)).toBeNull()

    // Live points that slip Bob one place show a drop against his settled rank.
    expect(rankMovement(snaps.get(bob), snaps.get(bob)!.rank + 1, true)).toBe(-1)
    expect(rankMovement(snaps.get(bob), snaps.get(bob)!.rank, true)).toBeNull()
    await client.close()
  })

  it('drops snapshot rows for users who left the board (no phantom +1 for the rest)', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const a = await makeUser(db, 'a', 'Alice')
    await makeUser(db, 'b', 'Bob')
    await makeUser(db, 'c', 'Carol')
    await updateRankSnapshots(db, competitionId)
    const first = await getRankSnapshots(db, competitionId)
    expect([...first.values()].every((s) => s.prevRank === null)).toBe(true)

    // Alice (rank 1) goes private and leaves the visible board. Bob/Carol
    // genuinely shift up, but Alice's stale row must not linger to imply they
    // each climbed against a ghost - and re-snapshotting must converge.
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, a))
    await updateRankSnapshots(db, competitionId)
    const rows = await db.select().from(leaderboardRank).where(eq(leaderboardRank.competitionId, competitionId))
    expect(rows.map((r) => r.userId).sort()).toEqual(['b', 'c'])
    // Second pass with no further change: arrows settle (the shift was real
    // once, but it does not regenerate every tick).
    await updateRankSnapshots(db, competitionId)
    const settled = await db.select().from(leaderboardRank).where(eq(leaderboardRank.competitionId, competitionId))
    expect(settled.map((r) => r.userId).sort()).toEqual(['b', 'c'])
    const snaps = await getRankSnapshots(db, competitionId)
    expect(rankMovement(snaps.get('b'), snaps.get('b')!.rank, false)).toBeNull()
    await client.close()
  })

  it('no-ops on an empty board (no users) without writing snapshots', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await updateRankSnapshots(db, competitionId)
    expect((await getRankSnapshots(db, competitionId)).size).toBe(0)
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
    const first = await getLeagueRankSnapshots(db, leagueId)
    expect([...first.values()].every((s) => s.prevRank === null)).toBe(true)

    // Bob (private profile) overtakes Alice inside the league.
    await score(db, await makePrediction(db, { userId: bob, matchId: m2, roundId, home: 2, away: 0, lockedAt: new Date() }), 5)
    await updateLeagueRankSnapshots(db, competitionId)
    const snaps = await getLeagueRankSnapshots(db, leagueId)
    expect(rankMovement(snaps.get(bob), snaps.get(bob)!.rank, false)).toBe(1)
    expect(rankMovement(snaps.get(alice), snaps.get(alice)!.rank, false)).toBe(-1)
    // Carol's league is untouched by the other league's churn.
    const other = await getLeagueRankSnapshots(db, otherLeague)
    expect(rankMovement(other.get(carol), other.get(carol)!.rank, false)).toBeNull()
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
    const snaps = await getLeagueRankSnapshots(db, leagueId)
    expect(rankMovement(snaps.get(bob), snaps.get(bob)!.rank, false)).toBeNull()
    await client.close()
  })
})
