import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getPlatformStats } from './platform'

describe('getPlatformStats', () => {
  it('is all zeros on an empty database', async () => {
    const { db, client } = await createTestDb()
    expect(await getPlatformStats(db)).toEqual({ players: 0, predictions: 0 })
    await client.close()
  })

  it('counts registered players and predictions made', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-20T16:00:00Z') })
    await makePrediction(db, { userId: 'alice', matchId: m, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId: 'bob', matchId: m, roundId, home: 2, away: 1 })

    expect(await getPlatformStats(db)).toEqual({ players: 2, predictions: 2 })
    await client.close()
  })
})
