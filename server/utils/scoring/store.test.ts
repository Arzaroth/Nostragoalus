import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { ensureDefaultScoringConfig, getActiveScoringConfig } from './store'

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
    await client.close()
  })
})
