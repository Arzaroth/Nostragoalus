import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeCompetition, seedCompetition } from '../../../tests/factories'
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
  it('inserts new matches linked to a round', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    const res = await upsertMatches(db, cid, [normalized()])
    expect(res).toMatchObject({ inserted: 1, updated: 0, skipped: 0 })
    const rows = await db.select().from(match).where(eq(match.competitionId, cid))
    expect(rows[0]).toMatchObject({ homeTeam: 'Mexico', stage: 'GROUP', groupName: 'A', status: 'SCHEDULED' })
    await client.close()
  })

  it('updates an existing match and flags score/status changes', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    await upsertMatches(db, cid, [normalized()])
    const res = await upsertMatches(db, cid, [
      normalized({ status: 'FINISHED', score: { fullTime: { home: 2, away: 1 } }, winner: 'HOME' }),
    ])
    expect(res).toMatchObject({ inserted: 0, updated: 1, skipped: 0 })
    expect(res.changedMatchIds).toHaveLength(1)
    await client.close()
  })

  it('flags a shootout score change even while full-time is frozen', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    const live = { status: 'LIVE', score: { fullTime: { home: 1, away: 1 } } } as const
    await upsertMatches(db, cid, [normalized(live)])
    // Full-time stays 1-1; only the shootout ticks up.
    const res = await upsertMatches(db, cid, [
      normalized({ ...live, score: { fullTime: { home: 1, away: 1 }, penalties: { home: 1, away: 0 } } }),
    ])
    expect(res.changedMatchIds).toHaveLength(1)
    // A second poll with the same shootout score is not a change.
    const again = await upsertMatches(db, cid, [
      normalized({ ...live, score: { fullTime: { home: 1, away: 1 }, penalties: { home: 1, away: 0 } } }),
    ])
    expect(again.changedMatchIds).toHaveLength(0)
    await client.close()
  })

  it('does not flag an unchanged update', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    await upsertMatches(db, cid, [normalized()])
    const res = await upsertMatches(db, cid, [normalized()])
    expect(res.updated).toBe(1)
    expect(res.changedMatchIds).toHaveLength(0)
    await client.close()
  })

  it('drops the odds mapping when a side correction flips the teams', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    await upsertMatches(db, cid, [normalized()])
    const [before] = await db.select().from(match)
    await db
      .update(match)
      .set({ oddsEventRef: 'ev-1', oddsEventSwapped: true })
      .where(eq(match.id, before.id))

    // Same teams again: the mapping survives.
    await upsertMatches(db, cid, [normalized()])
    let [row] = await db.select().from(match).where(eq(match.id, before.id))
    expect(row.oddsEventRef).toBe('ev-1')

    // Provider corrects home/away: the stored swapped flag is now wrong, so
    // the mapping is cleared for the matcher to re-claim.
    const swapped = normalized()
    const fixed: typeof swapped = {
      ...swapped,
      homeTeam: swapped.awayTeam,
      awayTeam: swapped.homeTeam,
    }
    await upsertMatches(db, cid, [fixed])
    ;[row] = await db.select().from(match).where(eq(match.id, before.id))
    expect(row.oddsEventRef).toBeNull()
    expect(row.oddsEventSwapped).toBe(false)
    await client.close()
  })

  it('does not downgrade a finished match with non-final data', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    await upsertMatches(db, cid, [normalized({ status: 'FINISHED', score: { fullTime: { home: 2, away: 1 } } })])
    const res = await upsertMatches(db, cid, [normalized({ status: 'SCHEDULED', score: { fullTime: { home: null, away: null } } })])
    expect(res).toMatchObject({ inserted: 0, updated: 0, skipped: 1 })
    await client.close()
  })

  it('skips matches whose round is not seeded', async () => {
    const { db, client } = await createTestDb()
    const cid = await makeCompetition(db)
    const res = await upsertMatches(db, cid, [normalized()])
    expect(res).toMatchObject({ inserted: 0, updated: 0, skipped: 1 })
    await client.close()
  })

  it('isolates the same provider match id across competitions', async () => {
    const { db, client } = await createTestDb()
    const c1 = await seedCompetition(db)
    const c2 = await seedCompetition(db)
    await upsertMatches(db, c1, [normalized()])
    const res = await upsertMatches(db, c2, [normalized()])
    expect(res.inserted).toBe(1)
    await client.close()
  })
})
