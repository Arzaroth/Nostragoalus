import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, showcasePin, userAchievement } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeUser, seedCompetition } from '../../../tests/factories'
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

    expect(cab.showcase).toEqual([{ slot: 0, achievementKey: 'first-blood' }])
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
