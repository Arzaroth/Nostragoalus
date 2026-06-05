import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from './rounds'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { finalizeMatches, scoreMatchRow } from './finalize'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { match, prediction, scoringConfig } from '../../../db/schema'

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
})
