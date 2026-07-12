import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { seedCompetition, makeUser, makeMatch, makePrediction } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { getLiveProvisionalPoints } from './live'

const PAST = new Date('2026-06-11T00:00:00Z')

async function setup() {
  const { db, client } = await createTestDb()
  await ensureDefaultScoringConfig(db)
  const competitionId = await seedCompetition(db)
  const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
  return { db, client, competitionId, roundId }
}

describe('getLiveProvisionalPoints', () => {
  it('returns empty when nothing is live', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'SCHEDULED' })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 0, lockedAt: PAST })
    expect((await getLiveProvisionalPoints(db, competitionId)).size).toBe(0)
    await client.close()
  })

  it('scores locked predictions against the current live scoreline', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const exact = await makeUser(db, 'exact', 'Exact')
    const outcome = await makeUser(db, 'outcome', 'Outcome')
    const miss = await makeUser(db, 'miss', 'Miss')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 2, fullTimeAway: 1 })
    await makePrediction(db, { userId: exact, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })
    await makePrediction(db, { userId: outcome, matchId: m, roundId, home: 3, away: 0, lockedAt: PAST })
    await makePrediction(db, { userId: miss, matchId: m, roundId, home: 0, away: 2, lockedAt: PAST })

    const live = await getLiveProvisionalPoints(db, competitionId)
    expect(live.get(exact)!.exact).toBe(1)
    expect(live.get(exact)!.points).toBeGreaterThan(live.get(outcome)!.points)
    expect(live.get(outcome)!.exact).toBe(0)
    expect(live.get(miss)!.points).toBe(0)
    await client.close()
  })

  it.each(['INTERRUPTED', 'SUSPENDED'] as const)('scores a halted %s match at its frozen scoreline', async (status) => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status, fullTimeHome: 2, fullTimeAway: 1 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 2, away: 1, lockedAt: PAST })

    const live = await getLiveProvisionalPoints(db, competitionId)
    expect(live.get(u)!.exact).toBe(1)
    expect(live.get(u)!.points).toBeGreaterThan(0)
    await client.close()
  })

  it('ignores unlocked predictions', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u', 'U')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 1, fullTimeAway: 1 })
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 1, away: 1, lockedAt: null })
    expect((await getLiveProvisionalPoints(db, competitionId)).size).toBe(0)
    await client.close()
  })
})
