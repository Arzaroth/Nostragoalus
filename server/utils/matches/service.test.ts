import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { ensureRounds, findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser } from '../../../tests/factories'
import { getMatchDetail, listMatches } from './service'

async function setup() {
  const ctx = await createTestDb()
  await ensureRounds(ctx.db)
  return ctx
}

describe('listMatches', () => {
  it('orders by kickoff and supports stage/status/matchday filters', async () => {
    const { db, client } = await setup()
    const g1 = (await findRoundId(db, 'GROUP', 1)) as string
    const g2 = (await findRoundId(db, 'GROUP', 2)) as string
    const later = await makeMatch(db, { roundId: g1, kickoffTime: new Date('2026-06-12T16:00:00Z'), status: 'SCHEDULED' })
    const earlier = await makeMatch(db, { roundId: g2, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED' })

    expect((await listMatches(db)).map((m) => m.id)).toEqual([earlier, later])
    expect((await listMatches(db, { status: 'FINISHED' })).map((m) => m.id)).toEqual([earlier])
    expect((await listMatches(db, { matchday: 1 })).map((m) => m.id)).toEqual([later])
    expect(await listMatches(db, { stage: 'GROUP' })).toHaveLength(2)
    await client.close()
  })
})

describe('getMatchDetail', () => {
  it('returns null for an unknown match', async () => {
    const { db, client } = await setup()
    expect(await getMatchDetail(db, 'nope')).toBeNull()
    await client.close()
  })

  it('returns the match and the caller prediction when provided', async () => {
    const { db, client } = await setup()
    const g1 = (await findRoundId(db, 'GROUP', 1)) as string
    const u = await makeUser(db, 'u1')
    const m = await makeMatch(db, { roundId: g1, kickoffTime: new Date('2026-06-11T16:00:00Z') })
    await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 1, away: 0 })

    const stranger = await makeUser(db, 'u2')
    expect((await getMatchDetail(db, m))?.myPrediction).toBeNull()
    expect((await getMatchDetail(db, m, stranger))?.myPrediction).toBeNull()
    expect((await getMatchDetail(db, m, u))?.myPrediction?.homeGoals).toBe(1)
    await client.close()
  })
})
