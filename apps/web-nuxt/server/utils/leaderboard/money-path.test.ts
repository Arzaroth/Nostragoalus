import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { match } from '../../../db/schema'
import { findRoundId } from '../sync/rounds'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { upsertPrediction } from '../predictions/service'
import { finalizeMatches } from '../sync/finalize'
import { getLeaderboard } from './service'

// The core money path end to end against a real (pglite) DB: three users make a
// pick through the prediction service while the window is open, the match
// finishes, finalize locks and scores those picks, and the leaderboard ranks them
// by what they scored. Guards the seam between predictions, sync/finalize and the
// leaderboard - each is unit-tested in isolation, but nothing exercised the loop.
describe('prediction -> finalize -> leaderboard', () => {
  it('scores locked picks at finalize and ranks them on the board (exact > outcome, ties share a rank)', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await ensureDefaultScoringConfig(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string

    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const carol = await makeUser(db, 'carol')

    const kickoff = new Date('2026-06-20T18:00:00Z')
    const matchId = await makeMatch(db, {
      competitionId,
      roundId,
      kickoffTime: kickoff,
      status: 'SCHEDULED',
      homeTeam: 'Spain',
      awayTeam: 'Brazil',
      homeTeamCode: 'ESP',
      awayTeamCode: 'BRA',
    })

    // Picks made before kickoff, through the real service (lock + commitment path).
    const beforeKickoff = new Date('2026-06-20T12:00:00Z')
    await upsertPrediction(db, { userId: alice, matchId, home: 2, away: 1 }, beforeKickoff) // exact
    await upsertPrediction(db, { userId: bob, matchId, home: 1, away: 0 }, beforeKickoff) // right outcome (home win)
    await upsertPrediction(db, { userId: carol, matchId, home: 1, away: 0 }, beforeKickoff) // same as bob -> ties

    // Picks are locked until kickoff: a late edit is refused.
    await expect(
      upsertPrediction(db, { userId: alice, matchId, home: 0, away: 0 }, new Date('2026-06-20T19:00:00Z')),
    ).rejects.toThrow()

    // The match finishes 2-1; finalize runs after kickoff.
    await db.update(match).set({ status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 }).where(eq(match.id, matchId))
    const res = await finalizeMatches(db, new Date('2026-06-20T20:00:00Z'))
    expect(res.changedMatchIds).toContain(matchId)

    const board = await getLeaderboard(db, { competitionId })
    const byId = Object.fromEntries(board.map((r) => [r.userId, r]))

    // Everyone who predicted is on the board.
    expect(byId[alice]).toBeDefined()
    expect(byId[bob]).toBeDefined()
    expect(byId[carol]).toBeDefined()

    // Exact beats outcome; the two identical outcome picks score the same.
    expect(byId[alice]!.totalPoints).toBeGreaterThan(byId[bob]!.totalPoints)
    expect(byId[bob]!.totalPoints).toBeGreaterThan(0)
    expect(byId[bob]!.totalPoints).toBe(byId[carol]!.totalPoints)

    // Ranking reflects the scores, and a tie shares a rank.
    expect(board[0]!.userId).toBe(alice)
    expect(byId[alice]!.rank).toBe(1)
    expect(byId[bob]!.rank).toBe(2)
    expect(byId[carol]!.rank).toBe(2)

    await client.close()
  })
})
