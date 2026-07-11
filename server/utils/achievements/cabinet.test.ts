import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, match, prediction, round, showcasePin, userAchievement } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { NotFoundError, ValidationError } from '../errors'
import { PONY_ACHIEVEMENT_KEY } from './catalog'
import { getCabinet, setShowcase } from './cabinet'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

describe('getCabinet', () => {
  it('returns sorted trophies, earned + locked achievements, and the showcase', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await db.insert(competitionAward).values([
      { competitionId: c, userId: alice, type: 'GROUP_PHASE', value: 5 },
      { competitionId: c, userId: alice, type: 'OVERALL', value: 8 },
    ])
    await db.insert(userAchievement).values([
      { userId: alice, competitionId: c, key: 'first-blood', tier: 'BRONZE', progress: 1 },
      // A global (competition-spanning) hidden badge.
      { userId: alice, competitionId: null, key: PONY_ACHIEVEMENT_KEY, tier: 'GOLD', progress: 1 },
    ])
    await db.insert(showcasePin).values({ userId: alice, competitionId: c, achievementKey: 'first-blood', slot: 0 })

    const cab = await getCabinet(db, { competitionId: c, userId: alice, viewerId: alice })
    expect(cab.isOwner).toBe(true)
    expect(cab.displayName).toBe('alice')
    // Trophies ordered by the canonical award order (OVERALL before GROUP_PHASE).
    expect(cab.trophies.map((t) => t.type)).toEqual(['OVERALL', 'GROUP_PHASE'])

    const ach = new Map(cab.achievements.map((a) => [a.key, a]))
    expect(ach.get('first-blood')?.earned?.tier).toBe('BRONZE')
    // Earned hidden badge shows; a locked ordinary badge shows with earned=null.
    expect(ach.get(PONY_ACHIEVEMENT_KEY)?.earned?.tier).toBe('GOLD')
    expect(ach.get('sharpshooter')?.earned).toBeNull()
    // Live metric value rides every metric badge (0 with no scored picks); the
    // event-granted secret has no metric, so current is null.
    expect(ach.get('sharpshooter')?.current).toBe(0)
    expect(ach.get(PONY_ACHIEVEMENT_KEY)?.current).toBeNull()
    // SHAME badges carry no progress bar (no chasing a cold streak).
    expect(ach.get('cold-streak')?.current).toBeNull()

    expect(cab.showcase).toEqual([{ slot: 0, achievementKey: 'first-blood' }])
  })

  it('surfaces the live metric value so locked badges show progress', async () => {
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
    const pid = await makePrediction(db, { userId: alice, matchId: m, roundId: g1.id, home: 1, away: 0 })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3 }).where(eq(prediction.id, pid))

    const cab = await getCabinet(db, { competitionId: c, userId: alice, viewerId: alice })
    const sharpshooter = cab.achievements.find((a) => a.key === 'sharpshooter')
    // 1 exact, still locked (bronze at 5): the client draws a 1/5 bar toward bronze.
    expect(sharpshooter?.earned).toBeNull()
    expect(sharpshooter?.current).toBe(1)
  })

  it('reports per-tier rarity as the share of participants holding each badge', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
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
    // Both alice and bob are participants (a prediction each) - the denominator is 2.
    const pa = await makePrediction(db, { userId: alice, matchId: m, roundId: g1.id, home: 1, away: 0 })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3 }).where(eq(prediction.id, pa))
    const pb = await makePrediction(db, { userId: bob, matchId: m, roundId: g1.id, home: 2, away: 2 })
    await db.update(prediction).set({ baseTier: 'MISS', totalPoints: 0, basePoints: 0 }).where(eq(prediction.id, pb))
    // Only alice holds first-blood.
    await db.insert(userAchievement).values({ userId: alice, competitionId: c, key: 'first-blood', tier: 'BRONZE', progress: 1 })

    const cab = await getCabinet(db, { competitionId: c, userId: alice, viewerId: alice })
    const firstBlood = cab.achievements.find((a) => a.key === 'first-blood')
    expect(firstBlood?.rarity).toEqual([{ tier: 'BRONZE', pct: 50 }]) // 1 of 2 participants
    const sharpshooter = cab.achievements.find((a) => a.key === 'sharpshooter')
    expect(sharpshooter?.rarity[0]?.pct).toBe(0) // nobody holds it
  })

  it('computes cumulative per-tier rarity (holders at that tier or higher)', async () => {
    const c = await seedCompetition(db)
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
    // Four participants (one prediction each) - the denominator.
    const users: string[] = []
    for (const name of ['a', 'b', 'cc', 'd']) {
      const u = await makeUser(db, name)
      users.push(u)
      await makePrediction(db, { userId: u, matchId: m, roundId: g1.id, home: 1, away: 0 })
    }
    // group-guru held at gold / silver / bronze / null (a legacy no-tier row).
    await db.insert(userAchievement).values([
      { userId: users[0], competitionId: c, key: 'group-guru', tier: 'GOLD', progress: 3 },
      { userId: users[1], competitionId: c, key: 'group-guru', tier: 'SILVER', progress: 2 },
      { userId: users[2], competitionId: c, key: 'group-guru', tier: 'BRONZE', progress: 1 },
      { userId: users[3], competitionId: c, key: 'group-guru', tier: null, progress: 1 },
    ])

    const cab = await getCabinet(db, { competitionId: c, userId: users[0], viewerId: users[0] })
    const gg = cab.achievements.find((a) => a.key === 'group-guru')
    // >= bronze: all 4 (null counts as lowest); >= silver: gold+silver = 2; >= gold: 1.
    expect(gg?.rarity).toEqual([
      { tier: 'BRONZE', pct: 100 },
      { tier: 'SILVER', pct: 50 },
      { tier: 'GOLD', pct: 25 },
    ])
  })

  it('omits rarity for GLOBAL and SHAME badges', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const [g1] = await db.select().from(round).where(eq(round.competitionId, c)).limit(1)
    const m = await makeMatch(db, { competitionId: c, roundId: g1.id, kickoffTime: new Date('2026-06-15T12:00:00Z') })
    await makePrediction(db, { userId: alice, matchId: m, roundId: g1.id, home: 1, away: 0 })
    await db.insert(userAchievement).values([
      // GLOBAL badge: competitionId null, held app-wide - no per-competition rarity.
      { userId: alice, competitionId: null, key: 'the-collector', tier: 'GOLD', progress: 1 },
      { userId: alice, competitionId: c, key: 'wooden-spoon', tier: 'BRONZE', progress: 1 },
    ])

    const cab = await getCabinet(db, { competitionId: c, userId: alice, viewerId: alice })
    expect(cab.achievements.find((a) => a.key === 'the-collector')?.rarity).toEqual([])
    expect(cab.achievements.find((a) => a.key === 'wooden-spoon')?.rarity).toEqual([])
  })

  it('exposes the icon override and the ongoing streak on a climbing streak badge', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const [g1] = await db.select().from(round).where(eq(round.competitionId, c)).limit(1)
    const mk = async (i: number) => {
      const m = await makeMatch(db, {
        competitionId: c,
        roundId: g1.id,
        status: 'FINISHED',
        fullTimeHome: 1,
        fullTimeAway: 0,
        winner: 'HOME',
        kickoffTime: new Date(Date.UTC(2026, 5, 15, 12 + i)),
      })
      await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, m))
      const pid = await makePrediction(db, { userId: alice, matchId: m, roundId: g1.id, home: 1, away: 0 })
      await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3 }).where(eq(prediction.id, pid))
    }
    await mk(0)
    await mk(1)

    const cab = await getCabinet(db, { competitionId: c, userId: alice, viewerId: alice })
    const ach = new Map(cab.achievements.map((a) => [a.key, a]))
    // hot-streak (bronze at 3): the best run rides `current`, the ongoing run `currentStreak`.
    expect(ach.get('hot-streak')?.current).toBe(2)
    expect(ach.get('hot-streak')?.currentStreak).toBe(2)
    // A non-streak badge never carries an ongoing streak.
    expect(ach.get('sharpshooter')?.currentStreak).toBeNull()
    // The per-key icon override rides the DTO; a badge without one stays null.
    expect(ach.get('grand-finale')?.icon).toBe('pi pi-crown')
    expect(ach.get('sharpshooter')?.icon).toBeNull()
  })

  it('hides an unearned secret badge and flags non-owners', async () => {
    const c = await seedCompetition(db)
    const bob = await makeUser(db, 'bob')
    const cab = await getCabinet(db, { competitionId: c, userId: bob, viewerId: 'someone-else' })
    expect(cab.isOwner).toBe(false)
    expect(cab.achievements.some((a) => a.key === PONY_ACHIEVEMENT_KEY)).toBe(false)
  })

  it('throws for an unknown user', async () => {
    const c = await seedCompetition(db)
    await expect(getCabinet(db, { competitionId: c, userId: 'ghost', viewerId: null })).rejects.toThrow(NotFoundError)
  })
})

describe('setShowcase', () => {
  async function earn(userId: string, competitionId: string) {
    await db.insert(competitionAward).values({ competitionId, userId, type: 'OVERALL', value: 8 })
    await db.insert(userAchievement).values([
      { userId, competitionId, key: 'first-blood', tier: 'BRONZE', progress: 1 },
      { userId, competitionId, key: 'sharpshooter', tier: 'BRONZE', progress: 5 },
    ])
  }

  it('pins earned achievements in order', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    const showcase = await setShowcase(db, {
      competitionId: c,
      userId: alice,
      items: [{ achievementKey: 'first-blood' }, { achievementKey: 'sharpshooter' }],
    })
    expect(showcase).toEqual([
      { slot: 0, achievementKey: 'first-blood' },
      { slot: 1, achievementKey: 'sharpshooter' },
    ])
    const persisted = await db.select().from(showcasePin).where(eq(showcasePin.userId, alice))
    expect(persisted).toHaveLength(2)
  })

  it('replaces the previous showcase wholesale', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await setShowcase(db, { competitionId: c, userId: alice, items: [{ achievementKey: 'first-blood' }] })
    const showcase = await setShowcase(db, {
      competitionId: c,
      userId: alice,
      items: [{ achievementKey: 'sharpshooter' }],
    })
    expect(showcase).toEqual([{ slot: 0, achievementKey: 'sharpshooter' }])
  })

  it('clears the showcase on an empty list', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await setShowcase(db, { competitionId: c, userId: alice, items: [{ achievementKey: 'first-blood' }] })
    expect(await setShowcase(db, { competitionId: c, userId: alice, items: [] })).toEqual([])
    expect(await db.select().from(showcasePin).where(eq(showcasePin.userId, alice))).toHaveLength(0)
  })

  it('rejects an unearned achievement', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await expect(
      setShowcase(db, { competitionId: c, userId: alice, items: [{ achievementKey: 'prophet' }] }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects duplicates', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await expect(
      setShowcase(db, {
        competitionId: c,
        userId: alice,
        items: [{ achievementKey: 'first-blood' }, { achievementKey: 'first-blood' }],
      }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects more achievements than there are slots', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    const tooMany = Array.from({ length: 4 }, () => ({ achievementKey: 'first-blood' }))
    await expect(setShowcase(db, { competitionId: c, userId: alice, items: tooMany })).rejects.toThrow(ValidationError)
  })
})
