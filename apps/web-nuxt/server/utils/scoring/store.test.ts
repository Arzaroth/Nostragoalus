import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeCompetition } from '../../../tests/factories'
import { scoringConfig } from '../../../db/schema'
import { DEFAULT_CROWD_OUTCOME_TIERS } from './config'
import { ensureDefaultScoringConfig, getActiveScoringConfig, getScoringConfigFor } from './store'

describe('scoring config store', () => {
  it('throws when there is no active config', async () => {
    const { db, client } = await createTestDb()
    await expect(getActiveScoringConfig(db)).rejects.toThrow(/no active scoring config/)
    await client.close()
  })

  it('seeds a default active config and is idempotent', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    await ensureDefaultScoringConfig(db)

    const { version, rules } = await getActiveScoringConfig(db)
    expect(version).toBe(1)
    expect(rules.base).toEqual({ exact: 3, diff: 2, outcome: 1, miss: 0 })
    expect(rules.bonusSource).toBe('CROWD')
    expect(rules.jokerMultiplier).toBe(2)
    expect(rules.crowdMinDenominator).toBe(5)
    expect(rules.crowdOutcomeTiers).toEqual(DEFAULT_CROWD_OUTCOME_TIERS)
    await client.close()
  })

  it('only treats the null-competition row as the default', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const competitionId = await makeCompetition(db)
    // An active override must not satisfy ensureDefaultScoringConfig's check.
    await db.insert(scoringConfig).values({ version: 2, isActive: true, competitionId, crowdTiers: [] })
    await ensureDefaultScoringConfig(db)
    expect((await db.select().from(scoringConfig)).length).toBe(2)
    await client.close()
  })
})

describe('getScoringConfigFor', () => {
  it('returns the default config when a competition has no override', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const competitionId = await makeCompetition(db)
    const { version, rules } = await getScoringConfigFor(db, competitionId)
    expect(version).toBe(1)
    expect(rules.base.exact).toBe(3)
    await client.close()
  })

  it('returns a competition override over the default', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    const competitionId = await makeCompetition(db)
    await db.insert(scoringConfig).values({ version: 2, isActive: true, competitionId, ptsExact: 7, crowdTiers: [] })

    const forComp = await getScoringConfigFor(db, competitionId)
    expect(forComp.version).toBe(2)
    expect(forComp.rules.base.exact).toBe(7)
    // The default is untouched and is still what getActiveScoringConfig returns.
    expect((await getActiveScoringConfig(db)).rules.base.exact).toBe(3)
    await client.close()
  })

  it('falls back to the default for a null competition', async () => {
    const { db, client } = await createTestDb()
    await ensureDefaultScoringConfig(db)
    expect((await getScoringConfigFor(db, null)).version).toBe(1)
    await client.close()
  })
})
