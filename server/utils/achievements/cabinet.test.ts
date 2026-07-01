import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, fridgePin, userAchievement } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeUser, seedCompetition } from '../../../tests/factories'
import { NotFoundError, ValidationError } from '../errors'
import { PONY_ACHIEVEMENT_KEY } from './catalog'
import { getCabinet, setFridge } from './cabinet'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

describe('getCabinet', () => {
  it('returns sorted trophies, earned + locked achievements, and the fridge', async () => {
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
    await db.insert(fridgePin).values({ userId: alice, competitionId: c, itemType: 'TROPHY', itemKey: 'OVERALL', slot: 0 })

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

    expect(cab.fridge).toEqual([{ slot: 0, itemType: 'TROPHY', itemKey: 'OVERALL' }])
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

describe('setFridge', () => {
  async function earn(userId: string, competitionId: string) {
    await db.insert(competitionAward).values({ competitionId, userId, type: 'OVERALL', value: 8 })
    await db.insert(userAchievement).values({ userId, competitionId, key: 'first-blood', tier: 'BRONZE', progress: 1 })
  }

  it('pins earned trophies and achievements in order', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    const fridge = await setFridge(db, {
      competitionId: c,
      userId: alice,
      items: [
        { itemType: 'TROPHY', itemKey: 'OVERALL' },
        { itemType: 'ACHIEVEMENT', itemKey: 'first-blood' },
      ],
    })
    expect(fridge).toEqual([
      { slot: 0, itemType: 'TROPHY', itemKey: 'OVERALL' },
      { slot: 1, itemType: 'ACHIEVEMENT', itemKey: 'first-blood' },
    ])
    const persisted = await db.select().from(fridgePin).where(eq(fridgePin.userId, alice))
    expect(persisted).toHaveLength(2)
  })

  it('replaces the previous fridge wholesale', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await setFridge(db, { competitionId: c, userId: alice, items: [{ itemType: 'TROPHY', itemKey: 'OVERALL' }] })
    const fridge = await setFridge(db, {
      competitionId: c,
      userId: alice,
      items: [{ itemType: 'ACHIEVEMENT', itemKey: 'first-blood' }],
    })
    expect(fridge).toEqual([{ slot: 0, itemType: 'ACHIEVEMENT', itemKey: 'first-blood' }])
  })

  it('clears the fridge on an empty list', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await setFridge(db, { competitionId: c, userId: alice, items: [{ itemType: 'TROPHY', itemKey: 'OVERALL' }] })
    expect(await setFridge(db, { competitionId: c, userId: alice, items: [] })).toEqual([])
    expect(await db.select().from(fridgePin).where(eq(fridgePin.userId, alice))).toHaveLength(0)
  })

  it('rejects an unearned item', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await expect(
      setFridge(db, { competitionId: c, userId: alice, items: [{ itemType: 'TROPHY', itemKey: 'MADAME_IRMA' }] }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects duplicates', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    await expect(
      setFridge(db, {
        competitionId: c,
        userId: alice,
        items: [
          { itemType: 'TROPHY', itemKey: 'OVERALL' },
          { itemType: 'TROPHY', itemKey: 'OVERALL' },
        ],
      }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects more items than there are slots', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    await earn(alice, c)
    const tooMany = Array.from({ length: 7 }, () => ({ itemType: 'TROPHY' as const, itemKey: 'OVERALL' }))
    await expect(setFridge(db, { competitionId: c, userId: alice, items: tooMany })).rejects.toThrow(ValidationError)
  })
})
