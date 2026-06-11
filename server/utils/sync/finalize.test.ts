import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from './rounds'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { awardBestScorerBonuses } from '../bestscorer/service'
import { finalizeMatches, scoreMatchRow } from './finalize'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { bestScorerPick, championPick, goalEvent, match, prediction, scoringConfig } from '../../../db/schema'

const NOW = new Date('2026-06-11T20:00:00Z')
const KICKOFF = new Date('2026-06-11T16:00:00Z')

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  await ensureDefaultScoringConfig(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  return { ...ctx, competitionId, roundId }
}

async function predsByUser(db: Awaited<ReturnType<typeof setup>>['db']) {
  const rows = await db.select().from(prediction)
  return Object.fromEntries(rows.map((r) => [r.userId, r]))
}

describe('finalizeMatches', () => {
  it('locks, scores, is idempotent, and recomputes on a score correction', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u1 = await makeUser(db, 'u1')
    const u2 = await makeUser(db, 'u2')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    await makePrediction(db, { userId: u1, matchId: m, roundId, home: 2, away: 1 })
    await makePrediction(db, { userId: u2, matchId: m, roundId, home: 1, away: 1 })

    expect(await finalizeMatches(db, NOW)).toMatchObject({ locked: 2, scored: 1 })

    let preds = await predsByUser(db)
    expect(preds.u1).toMatchObject({ baseTier: 'EXACT', totalPoints: 3 })
    expect(preds.u2).toMatchObject({ baseTier: 'MISS', totalPoints: 0 })
    expect((await db.select().from(match).where(eq(match.id, m)))[0].scoringState).toBe('SCORED')

    expect((await finalizeMatches(db, NOW)).scored).toBe(0)

    await db.update(match).set({ fullTimeHome: 1, fullTimeAway: 1 }).where(eq(match.id, m))
    expect((await finalizeMatches(db, NOW)).scored).toBe(1)

    preds = await predsByUser(db)
    expect(preds.u1).toMatchObject({ baseTier: 'MISS', totalPoints: 0 })
    expect(preds.u2).toMatchObject({ baseTier: 'EXACT', totalPoints: 3 })
    await client.close()
  })

  it('loads config when scoreMatchRow is called without context', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u1')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED', fullTimeHome: 0, fullTimeAway: 0 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 0, away: 0, lockedAt: KICKOFF })
    expect(await scoreMatchRow(db, m)).toBe('scored')
    expect(await scoreMatchRow(db, m)).toBe('unchanged')
    expect((await db.select().from(prediction))[0].totalPoints).toBe(3)
    await client.close()
  })

  it('skips unknown, scheduled, and score-less finished matches', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const noScore = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
    const halfScore = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED', fullTimeHome: 1 })
    const scheduled = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'SCHEDULED' })

    expect((await finalizeMatches(db, NOW)).scored).toBe(0)
    expect(await scoreMatchRow(db, 'missing')).toBe('skipped')
    expect(await scoreMatchRow(db, scheduled)).toBe('skipped')
    expect(await scoreMatchRow(db, noScore)).toBe('skipped')
    expect(await scoreMatchRow(db, halfScore)).toBe('skipped')
    await client.close()
  })

  it('voids cancelled matches, refunds jokers, and is idempotent', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u1')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'CANCELLED' })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 0, isJoker: true, lockedAt: KICKOFF })
    await db.update(prediction).set({ totalPoints: 5 }).where(eq(prediction.id, pid))

    expect((await finalizeMatches(db, NOW)).voided).toBe(1)
    const [p] = await db.select().from(prediction).where(eq(prediction.id, pid))
    expect(p.totalPoints).toBeNull()
    expect(p.isJoker).toBe(false)
    expect((await db.select().from(match).where(eq(match.id, m)))[0].scoringState).toBe('VOID')
    expect((await finalizeMatches(db, NOW)).voided).toBe(0)
    await client.close()
  })

  it('voids postponed matches only after the cutoff', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const recent = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date(NOW.getTime() - 24 * 60 * 60 * 1000), status: 'POSTPONED' })
    const old = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000), status: 'POSTPONED' })

    expect((await finalizeMatches(db, NOW)).voided).toBe(1)
    expect((await db.select().from(match).where(eq(match.id, recent)))[0].scoringState).not.toBe('VOID')
    expect((await db.select().from(match).where(eq(match.id, old)))[0].scoringState).toBe('VOID')
    await client.close()
  })

  it('recomputes scored matches when the config version changes', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u1')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 2, away: 1, lockedAt: KICKOFF })

    await finalizeMatches(db, NOW)
    expect((await db.select().from(prediction))[0].totalPoints).toBe(3)

    await db.update(scoringConfig).set({ version: 2, ptsExact: 10 }).where(eq(scoringConfig.isActive, true))
    expect((await finalizeMatches(db, NOW)).scored).toBe(1)
    expect((await db.select().from(prediction))[0].totalPoints).toBe(10)
    await client.close()
  })

  it('persists a crowd-rarity bonus and its share when enough players predict', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    const exactUser = await makeUser(db, 'exact')
    await makePrediction(db, { userId: exactUser, matchId: m, roundId, home: 2, away: 1, lockedAt: KICKOFF })
    for (let i = 0; i < 5; i += 1) {
      const u = await makeUser(db, `u${i}`)
      await makePrediction(db, { userId: u, matchId: m, roundId, home: 0, away: 0, lockedAt: KICKOFF })
    }

    await finalizeMatches(db, NOW)
    const [p] = await db.select().from(prediction).where(eq(prediction.userId, exactUser))
    expect(p.baseTier).toBe('EXACT')
    expect(p.bonusPoints).toBe(1)
    expect(p.bonusSource).toBe('CROWD')
    expect(Number(p.crowdShare)).toBeCloseTo(1 / 6, 3)
    expect(p.totalPoints).toBe(4)
    await client.close()
  })

  it('awards the odds bonus from the closing snapshot when the config uses ODDS', async () => {
    const { db, client, competitionId, roundId } = await setup()
    await db.update(scoringConfig).set({ bonusSource: 'ODDS', version: 2 }).where(eq(scoringConfig.isActive, true))
    const u1 = await makeUser(db, 'u1')
    const u2 = await makeUser(db, 'u2')
    const u3 = await makeUser(db, 'u3')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED', fullTimeHome: 0, fullTimeAway: 1 })
    await makePrediction(db, { userId: u1, matchId: m, roundId, home: 0, away: 1 }) // exact, hits outcome
    await makePrediction(db, { userId: u2, matchId: m, roundId, home: 0, away: 2 }) // outcome only
    await makePrediction(db, { userId: u3, matchId: m, roundId, home: 1, away: 0 }) // miss

    const { insertOddsSnapshots } = await import('../odds/store')
    await insertOddsSnapshots(db, [
      {
        matchId: m,
        provider: 'sofascore',
        providerEventRef: 'e',
        kind: 'POLL',
        // Stale early price - must NOT be the one used.
        current: { home: 2.1, draw: 3.4, away: 9 },
        initial: null,
        bookmakers: null,
        fetchedAt: new Date(KICKOFF.getTime() - 60 * 60 * 1000),
      },
      {
        matchId: m,
        provider: 'sofascore',
        providerEventRef: 'e',
        kind: 'POLL',
        // Closing: away win at 3.6 -> tier {minDecimalOdds: 3.5, bonus: 3}.
        current: { home: 2.1, draw: 3.4, away: 3.6 },
        initial: null,
        bookmakers: null,
        fetchedAt: KICKOFF,
      },
    ])

    expect(await finalizeMatches(db, NOW)).toMatchObject({ scored: 1 })
    const preds = await predsByUser(db)
    // Joker applies to bonus by default: (base + bonus) * 1 for non-jokers.
    expect(preds.u1).toMatchObject({ baseTier: 'EXACT', bonusPoints: 3, bonusSource: 'ODDS', totalPoints: 6 })
    expect(preds.u2).toMatchObject({ baseTier: 'OUTCOME', bonusPoints: 3, bonusSource: 'ODDS', totalPoints: 4 })
    expect(preds.u3).toMatchObject({ baseTier: 'MISS', bonusPoints: 0, totalPoints: 0 })

    // Rescoring after a config bump resolves the same closing odds.
    await db.update(scoringConfig).set({ version: 3 }).where(eq(scoringConfig.isActive, true))
    expect((await finalizeMatches(db, NOW)).scored).toBe(1)
    expect((await predsByUser(db)).u1).toMatchObject({ bonusPoints: 3, totalPoints: 6 })
    await client.close()
  })

  it('scores without a bonus when no pre-kickoff snapshot exists under ODDS', async () => {
    const { db, client, competitionId, roundId } = await setup()
    await db.update(scoringConfig).set({ bonusSource: 'ODDS', version: 2 }).where(eq(scoringConfig.isActive, true))
    const u1 = await makeUser(db, 'u1')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED', fullTimeHome: 0, fullTimeAway: 1 })
    await makePrediction(db, { userId: u1, matchId: m, roundId, home: 0, away: 1 })
    expect(await finalizeMatches(db, NOW)).toMatchObject({ scored: 1 })
    expect((await predsByUser(db)).u1).toMatchObject({ baseTier: 'EXACT', bonusPoints: 0, bonusSource: 'ODDS', totalPoints: 3 })
    await client.close()
  })

  it('awards the champion bonus when the final is decided', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const champ = await makeUser(db, 'champ')
    const loser = await makeUser(db, 'loser')
    // potentialPoints is the snapshot taken at pick time - the award must pay
    // exactly that, not the flat config bonus.
    await db.insert(championPick).values({ userId: champ, competitionId, teamCode: 'BRA', teamName: 'Brazil', fifaRank: 25, potentialPoints: 25 })
    await db.insert(championPick).values({ userId: loser, competitionId, teamCode: 'ARG', teamName: 'Argentina' })
    await makeMatch(db, {
      competitionId,
      roundId: finalRound,
      stage: 'FINAL',
      kickoffTime: KICKOFF,
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      homeTeamCode: 'BRA',
      awayTeamCode: 'ARG',
      winner: 'HOME',
    })

    await finalizeMatches(db, NOW)
    const picks = Object.fromEntries((await db.select().from(championPick)).map((p) => [p.userId, p.awardedPoints]))
    expect(picks[champ]).toBe(25)
    expect(picks[loser]).toBe(0)
    await client.close()
  })

  it('awards the best-scorer bonus when the final is decided', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const winner = await makeUser(db, 'boot')
    const loser = await makeUser(db, 'noboot')
    await db.insert(bestScorerPick).values({ userId: winner, competitionId, playerId: 'p-mbappe', playerName: 'Kylian MBAPPE', teamCode: 'FRA', teamName: 'France' })
    await db.insert(bestScorerPick).values({ userId: loser, competitionId, playerId: 'p-messi', playerName: 'Lionel MESSI', teamCode: 'ARG', teamName: 'Argentina' })
    const final = await makeMatch(db, {
      competitionId,
      roundId: finalRound,
      stage: 'FINAL',
      kickoffTime: KICKOFF,
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      homeTeamCode: 'FRA',
      awayTeamCode: 'ARG',
      winner: 'HOME',
    })
    await db.insert(goalEvent).values({ matchId: final, competitionId, side: 'HOME', teamName: 'France', teamCode: 'FRA', playerId: 'p-mbappe', playerName: 'Kylian MBAPPE' })

    await finalizeMatches(db, NOW)
    // The task awards the best-scorer bonus after the detail sync refreshes
    // goal_event (so it never reads a half-synced final).
    await awardBestScorerBonuses(db, competitionId, 10)
    const picks = Object.fromEntries((await db.select().from(bestScorerPick)).map((p) => [p.userId, p.awardedPoints]))
    expect(picks[winner]).toBe(10)
    expect(picks[loser]).toBe(0)
    await client.close()
  })

  it('awards the champion bonus to the away winner of a final', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const champ = await makeUser(db, 'champ-away')
    await db.insert(championPick).values({ userId: champ, competitionId, teamCode: 'ARG', teamName: 'Argentina' })
    await makeMatch(db, {
      competitionId,
      roundId: finalRound,
      stage: 'FINAL',
      kickoffTime: KICKOFF,
      status: 'FINISHED',
      fullTimeHome: 0,
      fullTimeAway: 1,
      homeTeamCode: 'BRA',
      awayTeamCode: 'ARG',
      winner: 'AWAY',
    })

    await finalizeMatches(db, NOW)
    const picks = Object.fromEntries((await db.select().from(championPick)).map((p) => [p.userId, p.awardedPoints]))
    expect(picks[champ]).toBe(10)
    await client.close()
  })
})
