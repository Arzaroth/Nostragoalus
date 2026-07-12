import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prediction, round } from '../db/schema'
import { getOwnPredictionRef, getPredictionForShare } from '../server/utils/predictions/service'
import { createTestDb, type TestDb } from './db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from './factories'

let db: TestDb
let client: Awaited<ReturnType<typeof createTestDb>>['client']

beforeEach(async () => {
  ;({ db, client } = await createTestDb())
})
afterEach(async () => {
  await client.close()
})

async function setup() {
  const owner = await makeUser(db, 'owner', 'Arzaroth')
  const other = await makeUser(db, 'other', 'Someone Else')
  const competitionId = await seedCompetition(db, { name: 'World Cup' })
  const [grp] = await db.select().from(round).where(eq(round.competitionId, competitionId)).limit(1)
  const matchId = await makeMatch(db, {
    competitionId,
    roundId: grp.id,
    kickoffTime: new Date('2026-06-20T18:00:00Z'),
    groupName: 'Group F',
    homeTeam: 'England',
    awayTeam: 'Senegal',
    homeTeamCode: 'ENG',
    awayTeamCode: 'SEN',
    status: 'FINISHED',
    fullTimeHome: 3,
    fullTimeAway: 1,
  })
  const predictionId = await makePrediction(db, { userId: owner, matchId, roundId: grp.id, home: 3, away: 1, isJoker: true })
  return { owner, other, matchId, predictionId }
}

describe('getOwnPredictionRef', () => {
  it('returns the ref for the owner only', async () => {
    const { owner, other, matchId, predictionId } = await setup()
    const ref = await getOwnPredictionRef(db, owner, matchId)
    expect(ref?.id).toBe(predictionId)
    expect(ref?.kickoffTime).toBeInstanceOf(Date)
    expect(await getOwnPredictionRef(db, other, matchId)).toBeNull()
    expect(await getOwnPredictionRef(db, owner, crypto.randomUUID())).toBeNull()
  })
})

describe('getPredictionForShare', () => {
  it('joins match, competition and owner; passes scored fields through', async () => {
    const { predictionId } = await setup()
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 14, crowdShare: '0.04' }).where(eq(prediction.id, predictionId))
    const row = await getPredictionForShare(db, predictionId)
    expect(row).toMatchObject({
      ownerName: 'Arzaroth',
      competitionName: 'World Cup',
      group: 'Group F',
      homeTeam: 'England',
      awayTeam: 'Senegal',
      homeTeamCode: 'ENG',
      isJoker: true,
      baseTier: 'EXACT',
      totalPoints: 14,
    })
    expect(Number(row?.crowdShare)).toBeCloseTo(0.04)
  })

  it('returns null for an unknown id', async () => {
    await setup()
    expect(await getPredictionForShare(db, crypto.randomUUID())).toBeNull()
  })
})
