import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, round } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { NotFoundError } from '../errors'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { getAnalyticsCard } from './analytics-card'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
  await ensureDefaultScoringConfig(db)
})

describe('getAnalyticsCard', () => {
  it('distils the headline bias numbers from a scored pick', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const [g1] = await db.select().from(round).where(eq(round.competitionId, c)).limit(1)
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: g1.id,
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      winner: 'HOME',
      kickoffTime: new Date('2026-06-15T12:00:00Z'),
    })
    await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, m))
    // An exact call of a 1-0 home win: 100% accuracy, 100% exact, no goal lean.
    const pid = await makePrediction(db, { userId: alice, matchId: m, roundId: g1.id, home: 1, away: 0 })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3 }).where(eq(prediction.id, pid))

    const card = await getAnalyticsCard(db, { competitionId: c, userId: alice })
    expect(card.displayName).toBe('alice')
    expect(card.hasData).toBe(true)
    expect(card.accuracyPct).toBe(100)
    expect(card.exactPct).toBe(100)
    expect(card.goalLean).toBe(0)
  })

  it('reports hasData false with no scored picks', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const card = await getAnalyticsCard(db, { competitionId: c, userId: alice })
    expect(card.hasData).toBe(false)
  })

  it('throws for an unknown user', async () => {
    const c = await seedCompetition(db)
    await expect(getAnalyticsCard(db, { competitionId: c, userId: 'ghost' })).rejects.toThrow(NotFoundError)
  })
})
