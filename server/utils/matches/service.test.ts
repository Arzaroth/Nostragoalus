import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getMatchDetail, getTeamMatches, listMatches } from './service'

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  return { ...ctx, competitionId }
}

describe('listMatches', () => {
  it('orders by kickoff and supports stage/status/matchday filters', async () => {
    const { db, client, competitionId } = await setup()
    const g1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const g2 = (await findRoundId(db, competitionId, 'GROUP', 2)) as string
    const later = await makeMatch(db, { competitionId, roundId: g1, kickoffTime: new Date('2026-06-12T16:00:00Z'), status: 'SCHEDULED' })
    const earlier = await makeMatch(db, { competitionId, roundId: g2, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED' })

    expect((await listMatches(db, { competitionId })).map((m) => m.id)).toEqual([earlier, later])
    expect((await listMatches(db, { competitionId, status: 'FINISHED' })).map((m) => m.id)).toEqual([earlier])
    expect((await listMatches(db, { competitionId, matchday: 1 })).map((m) => m.id)).toEqual([later])
    expect(await listMatches(db, { competitionId, stage: 'GROUP' })).toHaveLength(2)
    await client.close()
  })

  it('does not return matches from another competition', async () => {
    const { db, client, competitionId } = await setup()
    const other = await seedCompetition(db)
    const g1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const og1 = (await findRoundId(db, other, 'GROUP', 1)) as string
    await makeMatch(db, { competitionId, roundId: g1, kickoffTime: new Date('2026-06-11T16:00:00Z') })
    await makeMatch(db, { competitionId: other, roundId: og1, kickoffTime: new Date('2026-06-11T16:00:00Z') })
    expect(await listMatches(db, { competitionId })).toHaveLength(1)
    await client.close()
  })
})

describe('getTeamMatches', () => {
  it('returns the team matches (home or away) ordered by kickoff', async () => {
    const { db, client, competitionId } = await setup()
    const g1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const a = await makeMatch(db, { competitionId, roundId: g1, kickoffTime: new Date('2026-06-11T16:00:00Z'), homeTeamCode: 'FRA', awayTeamCode: 'MEX' })
    const b = await makeMatch(db, { competitionId, roundId: g1, kickoffTime: new Date('2026-06-15T16:00:00Z'), homeTeamCode: 'BRA', awayTeamCode: 'FRA' })
    await makeMatch(db, { competitionId, roundId: g1, kickoffTime: new Date('2026-06-12T16:00:00Z'), homeTeamCode: 'BRA', awayTeamCode: 'MEX' })
    expect((await getTeamMatches(db, competitionId, 'FRA')).map((m) => m.id)).toEqual([a, b])
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
    const { db, client, competitionId } = await setup()
    const g1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const u = await makeUser(db, 'u1')
    const stranger = await makeUser(db, 'u2')
    const m = await makeMatch(db, { competitionId, roundId: g1, kickoffTime: new Date('2026-06-11T16:00:00Z') })
    await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 1, away: 0 })

    expect((await getMatchDetail(db, m))?.myPrediction).toBeNull()
    expect((await getMatchDetail(db, m, stranger))?.myPrediction).toBeNull()
    expect((await getMatchDetail(db, m, u))?.myPrediction?.homeGoals).toBe(1)
    await client.close()
  })
})
