import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { ensureRounds } from './rounds'
import { resultHashOf, upsertMatches } from './upsert-matches'
import { match } from '../../../db/schema'
import type { NormalizedMatch } from '../../../shared/types/match'

function normalized(overrides: Partial<NormalizedMatch> = {}): NormalizedMatch {
  return {
    providerMatchId: 'p1',
    stage: 'GROUP',
    group: 'A',
    matchday: 1,
    homeTeam: { name: 'Mexico', code: 'MEX' },
    awayTeam: { name: 'Canada', code: 'CAN' },
    kickoffTime: '2026-06-11T16:00:00Z',
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null } },
    winner: null,
    ...overrides,
  }
}

describe('resultHashOf', () => {
  it('is stable for the same inputs and varies with the score', () => {
    expect(resultHashOf('FINISHED', 2, 1)).toBe('FINISHED:2:1')
    expect(resultHashOf('FINISHED', null, null)).toBe('FINISHED::')
    expect(resultHashOf('FINISHED', 2, 1)).not.toBe(resultHashOf('FINISHED', 2, 2))
  })
})

describe('upsertMatches', () => {
  it('inserts new matches and links them to a round', async () => {
    const { db, client } = await createTestDb()
    await ensureRounds(db)
    const res = await upsertMatches(db, [normalized()])
    expect(res).toEqual({ inserted: 1, updated: 0, skipped: 0 })

    const rows = await db.select().from(match).where(eq(match.providerMatchId, 'p1'))
    expect(rows[0]).toMatchObject({ homeTeam: 'Mexico', stage: 'GROUP', groupName: 'A', status: 'SCHEDULED' })
    await client.close()
  })

  it('updates an existing match in place', async () => {
    const { db, client } = await createTestDb()
    await ensureRounds(db)
    await upsertMatches(db, [normalized()])
    const res = await upsertMatches(db, [
      normalized({ status: 'FINISHED', score: { fullTime: { home: 2, away: 1 } }, winner: 'HOME' }),
    ])
    expect(res).toEqual({ inserted: 0, updated: 1, skipped: 0 })

    const rows = await db.select().from(match).where(eq(match.providerMatchId, 'p1'))
    expect(rows[0]).toMatchObject({ status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1, winner: 'HOME' })
    await client.close()
  })

  it('does not downgrade a finished match with non-final data', async () => {
    const { db, client } = await createTestDb()
    await ensureRounds(db)
    await upsertMatches(db, [normalized({ status: 'FINISHED', score: { fullTime: { home: 2, away: 1 } } })])
    const res = await upsertMatches(db, [normalized({ status: 'SCHEDULED', score: { fullTime: { home: null, away: null } } })])
    expect(res).toEqual({ inserted: 0, updated: 0, skipped: 1 })

    const rows = await db.select().from(match).where(eq(match.providerMatchId, 'p1'))
    expect(rows[0].status).toBe('FINISHED')
    await client.close()
  })

  it('skips matches whose round is not seeded', async () => {
    const { db, client } = await createTestDb()
    const res = await upsertMatches(db, [normalized()])
    expect(res).toEqual({ inserted: 0, updated: 0, skipped: 1 })
    await client.close()
  })
})
