import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, round, userAchievement } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { backfillAchievements } from './backfill'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

async function groupRound(competitionId: string): Promise<string> {
  const rows = await db.select().from(round).where(eq(round.competitionId, competitionId))
  return rows.find((r) => r.stage === 'GROUP' && r.matchday === 1)!.id
}

// One scored EXACT prediction earns the `first-blood` badge. finalize would grant
// it only on a newly-scoring tick; here the data is already scored, so only the
// backfill reaches it.
async function earnFirstBlood(competitionId: string, userId: string): Promise<void> {
  const g1 = await groupRound(competitionId)
  const m = await makeMatch(db, {
    competitionId,
    roundId: g1,
    stage: 'GROUP',
    status: 'FINISHED',
    fullTimeHome: 1,
    fullTimeAway: 0,
    winner: 'HOME',
    kickoffTime: new Date('2026-06-15T12:00:00Z'),
  })
  await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, m))
  const p = await makePrediction(db, { userId, matchId: m, roundId: g1, home: 1, away: 0 })
  await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3, scoredAt: new Date() }).where(eq(prediction.id, p))
}

describe('backfillAchievements', () => {
  it('grants already-earned badges across every competition and is idempotent', async () => {
    const c1 = await seedCompetition(db, { name: 'One' })
    const c2 = await seedCompetition(db, { name: 'Two' })
    const alice = await makeUser(db, 'alice')
    await earnFirstBlood(c1, alice)
    // c2 has no scored predictions, so nothing is granted there.

    const summary = await backfillAchievements(db)
    expect(summary.competitions).toBe(2)
    expect(summary.badgesGranted).toBeGreaterThanOrEqual(1)
    const rows = await db.select().from(userAchievement).where(eq(userAchievement.competitionId, c1))
    expect(rows.some((r) => r.key === 'first-blood')).toBe(true)
    expect(summary.perCompetition.find((p) => p.competitionId === c2)?.granted).toBe(0)

    // A re-run grants nothing new: the evaluation is idempotent and a high-water mark.
    const again = await backfillAchievements(db)
    expect(again.badgesGranted).toBe(0)
  })
})
