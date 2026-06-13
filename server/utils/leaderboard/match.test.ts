import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { prediction, user } from '../../../db/schema'
import { seedCompetition, makeUser, makeMatch, makePrediction, makeLeague, addLeagueMember } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { DEFAULT_RULES } from '../scoring/config'
import { getMatchLeagueStandings } from './match'

const PAST = new Date('2026-06-11T00:00:00Z')

async function setup() {
  const { db, client } = await createTestDb()
  await ensureDefaultScoringConfig(db)
  const competitionId = await seedCompetition(db)
  const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
  const leagueId = await makeLeague(db, { competitionId })
  return { db, client, competitionId, roundId, leagueId }
}

describe('getMatchLeagueStandings', () => {
  it('hides picks before kickoff (scope upcoming, no rows)', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    await addLeagueMember(db, leagueId, u)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'SCHEDULED' })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 0, lockedAt: PAST })

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: u })
    expect(board.scope).toBe('upcoming')
    expect(board.rows).toEqual([])
    expect(board.notPredicted).toBe(0)
    await client.close()
  })

  it('returns upcoming for an unknown match id', async () => {
    const { db, client, leagueId } = await setup()
    const board = await getMatchLeagueStandings(db, { matchId: crypto.randomUUID(), leagueId, viewerId: 'nobody' })
    expect(board.scope).toBe('upcoming')
    await client.close()
  })

  it('ranks members by live points against the current scoreline', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const exact = await makeUser(db, 'exact', 'Exact')
    const outcome = await makeUser(db, 'outcome', 'Outcome')
    const miss = await makeUser(db, 'miss', 'Miss')
    const noPick = await makeUser(db, 'nopick', 'NoPick')
    for (const u of [exact, outcome, miss, noPick]) await addLeagueMember(db, leagueId, u)
    // A predictor outside the league: feeds the crowd histogram, never shown.
    const outsider = await makeUser(db, 'outsider', 'Outsider')

    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 2, fullTimeAway: 1 })
    await makePrediction(db, { userId: exact, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })
    await makePrediction(db, { userId: outcome, matchId: m, roundId, home: 3, away: 0, lockedAt: PAST })
    await makePrediction(db, { userId: miss, matchId: m, roundId, home: 0, away: 2, lockedAt: PAST })
    await makePrediction(db, { userId: outsider, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: exact })
    expect(board.scope).toBe('live')
    expect(board.rows.map((r) => r.userId)).toEqual([exact, outcome, miss])
    expect(board.rows[0]).toMatchObject({ rank: 1, baseTier: 'EXACT', isJoker: false })
    expect(board.rows[0].points).toBeGreaterThan(board.rows[1].points)
    expect(board.rows[2].points).toBe(0)
    // outsider is excluded from the league rows but the league has one no-pick member.
    expect(board.rows.some((r) => r.userId === outsider)).toBe(false)
    expect(board.notPredicted).toBe(1)
    await client.close()
  })

  it('scores PAUSED matches live too', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    await addLeagueMember(db, leagueId, u)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'PAUSED', fullTimeHome: 1, fullTimeAway: 1 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 1, lockedAt: PAST })

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: u })
    expect(board.scope).toBe('live')
    expect(board.rows[0].baseTier).toBe('EXACT')
    await client.close()
  })

  it('uses persisted points for a finished, finalized match', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const a = await makeUser(db, 'a', 'A')
    const b = await makeUser(db, 'b', 'B')
    await addLeagueMember(db, leagueId, a)
    await addLeagueMember(db, leagueId, b)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const pa = await makePrediction(db, { userId: a, matchId: m, roundId, home: 1, away: 0, lockedAt: PAST })
    const pb = await makePrediction(db, { userId: b, matchId: m, roundId, home: 2, away: 0, lockedAt: PAST })
    // Persisted (finalized) figures - the board must read these, not recompute.
    await db.update(prediction).set({ totalPoints: 7, baseTier: 'EXACT' }).where(eq(prediction.id, pa))
    await db.update(prediction).set({ totalPoints: 3, baseTier: 'OUTCOME' }).where(eq(prediction.id, pb))

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: a })
    expect(board.scope).toBe('final')
    expect(board.rows.map((r) => [r.userId, r.points])).toEqual([
      [a, 7],
      [b, 3],
    ])
    await client.close()
  })

  it('scores provisionally when a finished match is not finalized yet', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    await addLeagueMember(db, leagueId, u)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: u })
    expect(board.scope).toBe('final')
    expect(board.rows[0].baseTier).toBe('EXACT')
    expect(board.rows[0].points).toBeGreaterThan(0)
    await client.close()
  })

  it('gives every member 0 points on a live match with no scoreline yet', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    await addLeagueMember(db, leagueId, u)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE' })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 0, lockedAt: PAST })

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: u })
    expect(board.scope).toBe('live')
    expect(board.rows[0].points).toBe(0)
    expect(board.rows[0].baseTier).toBeNull()
    await client.close()
  })

  it('ignores unlocked predictions (counted as no pick)', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    await addLeagueMember(db, leagueId, u)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 1, fullTimeAway: 0 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 0, lockedAt: null })

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: u })
    expect(board.rows).toEqual([])
    expect(board.notPredicted).toBe(1)
    await client.close()
  })

  it('ties share a rank (standard competition ranking)', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const a = await makeUser(db, 'a', 'A')
    const b = await makeUser(db, 'b', 'B')
    const c = await makeUser(db, 'c', 'C')
    for (const u of [a, b, c]) await addLeagueMember(db, leagueId, u)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 2, fullTimeAway: 1 })
    // a and b both exact (tie), c misses.
    await makePrediction(db, { userId: a, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })
    await makePrediction(db, { userId: b, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })
    await makePrediction(db, { userId: c, matchId: m, roundId, home: 0, away: 3, lockedAt: PAST })

    const board = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: a })
    expect(board.rows[0].rank).toBe(1)
    expect(board.rows[1].rank).toBe(1)
    expect(board.rows[2].rank).toBe(3)
    await client.close()
  })

  it('hides admin-hidden and private members from outsiders, keeps the viewer', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const viewer = await makeUser(db, 'viewer', 'Viewer')
    const hidden = await makeUser(db, 'hidden', 'Hidden')
    const priv = await makeUser(db, 'priv', 'Priv')
    for (const u of [viewer, hidden, priv]) await addLeagueMember(db, leagueId, u)
    await db.update(user).set({ hiddenFromLeaderboard: true }).where(eq(user.id, hidden))
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, priv))
    await db.update(user).set({ hiddenFromLeaderboard: true }).where(eq(user.id, viewer))
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 1, fullTimeAway: 0 })
    for (const u of [viewer, hidden, priv]) await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 0, lockedAt: PAST })

    // Outsider view: private profiles excluded, admin-hidden excluded - but the
    // (hidden) viewer still sees their own row.
    const outsider = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: viewer, includePrivate: false })
    expect(outsider.rows.map((r) => r.userId).sort()).toEqual([viewer])

    // Member/admin view: private profiles included, hidden ones too.
    const member = await getMatchLeagueStandings(db, { matchId: m, leagueId, viewerId: viewer, includePrivate: true, includeHidden: true })
    expect(member.rows.map((r) => r.userId).sort()).toEqual([hidden, priv, viewer].sort())
    await client.close()
  })

  it('supports an odds-based bonus source', async () => {
    const { db, client, competitionId, roundId, leagueId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    await addLeagueMember(db, leagueId, u)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 2, fullTimeAway: 1 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })

    const board = await getMatchLeagueStandings(db, {
      matchId: m,
      leagueId,
      viewerId: u,
      rules: { ...DEFAULT_RULES, bonusSource: 'ODDS' },
    })
    expect(board.scope).toBe('live')
    expect(board.rows[0].baseTier).toBe('EXACT')
    await client.close()
  })
})
