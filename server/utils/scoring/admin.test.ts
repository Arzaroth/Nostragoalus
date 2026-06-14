import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import type { AppDatabase } from '../../../db/types'
import { findRoundId } from '../sync/rounds'
import { finalizeMatches } from '../sync/finalize'
import { ensureDefaultScoringConfig } from './store'
import { listScoringConfigs, saveScoringConfig, deleteScoringConfigOverride } from './admin'
import { DEFAULT_RULES } from './config'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { prediction } from '../../../db/schema'

const NOW = new Date('2026-06-11T20:00:00Z')
const KICKOFF = new Date('2026-06-11T16:00:00Z')

// One competition with a single finished, locked, exact-scoring prediction.
async function seedScoredComp(db: AppDatabase, slug: string) {
  const competitionId = await seedCompetition(db, { slug, name: slug })
  const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
  const userId = await makeUser(db, `u-${slug}`)
  const matchId = await makeMatch(db, {
    competitionId,
    roundId,
    kickoffTime: KICKOFF,
    status: 'FINISHED',
    fullTimeHome: 2,
    fullTimeAway: 1,
  })
  await makePrediction(db, { userId, matchId, roundId, home: 2, away: 1, lockedAt: KICKOFF })
  return { competitionId, matchId }
}

function withExact(exact: number) {
  return { ...DEFAULT_RULES, base: { exact, diff: 2, outcome: 1, miss: 0 } }
}

async function pointsFor(db: AppDatabase, matchId: string): Promise<number | null> {
  const [p] = await db.select().from(prediction).where(eq(prediction.matchId, matchId))
  return p.totalPoints
}

describe('saveScoringConfig', () => {
  it('bumps the version and recomputes every competition on the default config', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const a = await seedScoredComp(db, 'aaa')
    const b = await seedScoredComp(db, 'bbb')
    await finalizeMatches(db, NOW)
    expect(await pointsFor(db, a.matchId)).toBe(3)
    expect(await pointsFor(db, b.matchId)).toBe(3)

    const result = await saveScoringConfig(db, null, withExact(10))
    expect(result).toEqual({ version: 2, recomputed: 2 })
    expect(await pointsFor(db, a.matchId)).toBe(10)
    expect(await pointsFor(db, b.matchId)).toBe(10)
    await client.close()
  })

  it('recomputes only the overridden competition, leaving others on the default', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const a = await seedScoredComp(db, 'aaa')
    const b = await seedScoredComp(db, 'bbb')
    await finalizeMatches(db, NOW)

    const result = await saveScoringConfig(db, a.competitionId, withExact(20))
    expect(result.recomputed).toBe(1)
    expect(await pointsFor(db, a.matchId)).toBe(20)
    expect(await pointsFor(db, b.matchId)).toBe(3)
    await client.close()
  })

  it('updates an existing override in place rather than creating a second', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const a = await seedScoredComp(db, 'aaa')
    await finalizeMatches(db, NOW)

    await saveScoringConfig(db, a.competitionId, withExact(20))
    const second = await saveScoringConfig(db, a.competitionId, withExact(30))
    expect(second.version).toBe(3)
    expect(await pointsFor(db, a.matchId)).toBe(30)

    const list = await listScoringConfigs(db)
    // default + exactly one override
    expect(list.entries).toHaveLength(2)
    await client.close()
  })

  it('throws for an unknown competition', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    await expect(saveScoringConfig(db, 'nope', withExact(10))).rejects.toThrow(/competition not found/)
    await client.close()
  })
})

describe('deleteScoringConfigOverride', () => {
  it('removes the override and recomputes under the default', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const a = await seedScoredComp(db, 'aaa')
    await finalizeMatches(db, NOW)
    await saveScoringConfig(db, a.competitionId, withExact(20))
    expect(await pointsFor(db, a.matchId)).toBe(20)

    const result = await deleteScoringConfigOverride(db, a.competitionId)
    expect(result.recomputed).toBe(1)
    expect(await pointsFor(db, a.matchId)).toBe(3)
    await client.close()
  })

  it('throws when the competition has no override', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const a = await seedScoredComp(db, 'aaa')
    await expect(deleteScoringConfigOverride(db, a.competitionId)).rejects.toThrow(/no override/)
    await client.close()
  })
})

describe('listScoringConfigs', () => {
  it('returns the default first, the overrides, and per-competition flags', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const a = await seedScoredComp(db, 'aaa')
    const b = await seedScoredComp(db, 'bbb')
    await saveScoringConfig(db, a.competitionId, withExact(20))

    const list = await listScoringConfigs(db)
    expect(list.entries[0].competitionId).toBeNull()
    expect(list.entries).toHaveLength(2)
    expect(list.entries[1].competition?.slug).toBe('aaa')

    const compA = list.competitions.find((c) => c.id === a.competitionId)
    const compB = list.competitions.find((c) => c.id === b.competitionId)
    expect(compA?.hasOverride).toBe(true)
    expect(compB?.hasOverride).toBe(false)
    await client.close()
  })
})
