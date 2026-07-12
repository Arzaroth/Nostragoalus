import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { ensureRounds, findRoundId, roundDefForMatch } from './rounds'
import { makeCompetition } from '../../../tests/factories'
import { round } from '../../../db/schema'
import type { NormalizedMatch } from '../../../shared/types/match'

function m(stage: string, matchday: number | null): NormalizedMatch {
  return { stage, matchday } as unknown as NormalizedMatch
}

describe('roundDefForMatch', () => {
  it('builds a group matchday round', () => {
    expect(roundDefForMatch('GROUP', 2)).toMatchObject({
      kind: 'GROUP_MATCHDAY',
      stage: 'GROUP',
      matchday: 2,
      label: 'Group Matchday 2',
      sortOrder: 2,
    })
  })

  it('defaults a missing group matchday to 1', () => {
    expect(roundDefForMatch('GROUP', null).matchday).toBe(1)
  })

  it('builds knockout rounds ordered after the group stage', () => {
    expect(roundDefForMatch('R16', null)).toMatchObject({ kind: 'KNOCKOUT', stage: 'R16', matchday: null, label: 'Round of 16' })
    expect(roundDefForMatch('FINAL', null).sortOrder).toBeGreaterThan(roundDefForMatch('R16', null).sortOrder)
  })
})

describe('ensureRounds / findRoundId', () => {
  it('creates only the rounds present in the matches, idempotently', async () => {
    const { db, client } = await createTestDb()
    const cid = await makeCompetition(db, { slug: 'c1' })
    const matches = [m('GROUP', 1), m('GROUP', 1), m('GROUP', 2), m('R16', null), m('FINAL', null)]
    await ensureRounds(db, cid, matches)
    await ensureRounds(db, cid, matches)

    const rows = await db.select().from(round).where(eq(round.competitionId, cid))
    expect(rows).toHaveLength(4)
    expect(await findRoundId(db, cid, 'GROUP', 1)).toBeTypeOf('string')
    expect(await findRoundId(db, cid, 'FINAL', null)).toBeTypeOf('string')
    expect(await findRoundId(db, cid, 'GROUP', 3)).toBeNull()
    await client.close()
  })

  it('scopes rounds to their competition', async () => {
    const { db, client } = await createTestDb()
    const c1 = await makeCompetition(db, { slug: 'c1' })
    const c2 = await makeCompetition(db, { slug: 'c2' })
    await ensureRounds(db, c1, [m('GROUP', 1)])
    expect(await findRoundId(db, c1, 'GROUP', 1)).toBeTypeOf('string')
    expect(await findRoundId(db, c2, 'GROUP', 1)).toBeNull()
    await client.close()
  })
})
