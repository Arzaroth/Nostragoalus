import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { ensureRounds, findRoundId, ROUND_DEFS } from './rounds'
import { round } from '../../../db/schema'

describe('rounds', () => {
  it('seeds the nine WC rounds idempotently', async () => {
    const { db, client } = await createTestDb()
    await ensureRounds(db)
    await ensureRounds(db)
    const rows = await db.select().from(round)
    expect(rows).toHaveLength(ROUND_DEFS.length)
    await client.close()
  })

  it('finds a group round by matchday and a knockout round by stage', async () => {
    const { db, client } = await createTestDb()
    await ensureRounds(db)
    expect(await findRoundId(db, 'GROUP', 2)).toBeTypeOf('string')
    expect(await findRoundId(db, 'FINAL', null)).toBeTypeOf('string')
    // A knockout match may carry a provider matchday; it is ignored for round lookup.
    expect(await findRoundId(db, 'R16', 4)).toBeTypeOf('string')
    await client.close()
  })

  it('returns null when no matching round exists', async () => {
    const { db, client } = await createTestDb()
    expect(await findRoundId(db, 'GROUP', 1)).toBeNull()
    await client.close()
  })
})
