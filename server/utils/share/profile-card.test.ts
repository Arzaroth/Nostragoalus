import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, match, prediction, round, userAchievement } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { NotFoundError } from '../errors'
import { getProfileCard } from './profile-card'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

describe('getProfileCard', () => {
  it('reports rank, points, exacts and the trophy/badge haul', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await makeUser(db, 'bob')
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
    const pid = await makePrediction(db, { userId: alice, matchId: m, roundId: g1.id, home: 1, away: 0 })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3 }).where(eq(prediction.id, pid))
    await db.insert(competitionAward).values({ competitionId: c, userId: alice, type: 'OVERALL', value: 3 })
    await db.insert(userAchievement).values({ userId: alice, competitionId: c, key: 'first-blood', tier: 'BRONZE', progress: 1 })

    const cardData = await getProfileCard(db, { competitionId: c, userId: alice })
    expect(cardData.displayName).toBe('alice')
    expect(cardData.competitionName).toBe('Test Cup')
    expect(cardData.rank).toBe(1)
    expect(cardData.totalPoints).toBe(3)
    expect(cardData.exact).toBe(1)
    expect(cardData.trophies).toBe(1)
    expect(cardData.badges).toBe(1)
    expect(cardData.players).toBeGreaterThanOrEqual(2)
  })

  it('throws for an unknown user or competition', async () => {
    const c = await seedCompetition(db)
    await expect(getProfileCard(db, { competitionId: c, userId: 'ghost' })).rejects.toThrow(NotFoundError)
    const alice = await makeUser(db, 'alice')
    await expect(getProfileCard(db, { competitionId: 'nope', userId: alice })).rejects.toThrow(NotFoundError)
  })
})
