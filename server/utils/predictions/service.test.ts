import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getCrowdTotals, getMatchCrowdTotal, getMyPredictions, getMyStats, getUserPublicPredictions, setJoker, upsertPrediction } from './service'
import { prediction } from '../../../db/schema'
import { LockedError, NotFoundError, ValidationError } from '../errors'

const NOW = new Date('2026-06-10T00:00:00Z')
const FUTURE = new Date('2026-06-11T16:00:00Z')
const PAST = new Date('2026-06-09T16:00:00Z')

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, competitionId, roundId, userId }
}

describe('upsertPrediction', () => {
  it('rejects invalid goal values', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await expect(upsertPrediction(db, { userId, matchId: m, home: -1, away: 0 }, NOW)).rejects.toBeInstanceOf(ValidationError)
    await expect(upsertPrediction(db, { userId, matchId: m, home: 1.5, away: 0 }, NOW)).rejects.toBeInstanceOf(ValidationError)
    await expect(upsertPrediction(db, { userId, matchId: m, home: 0, away: 100 }, NOW)).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('throws when the match does not exist', async () => {
    const { db, client, userId } = await setup()
    await expect(upsertPrediction(db, { userId, matchId: 'nope', home: 1, away: 0 }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('rejects predictions for matches without both teams confirmed', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const placeholder = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE, homeTeamCode: null })
    await expect(upsertPrediction(db, { userId, matchId: placeholder, home: 1, away: 0 }, NOW)).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('throws when the match is already locked', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await expect(upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)).rejects.toBeInstanceOf(LockedError)
    await client.close()
  })

  it('inserts then updates a prediction in place', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    const id1 = await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    const id2 = await upsertPrediction(db, { userId, matchId: m, home: 2, away: 2 }, NOW)
    expect(id1).toBe(id2)
    const [p] = await db.select().from(prediction).where(eq(prediction.id, id1))
    expect(p).toMatchObject({ homeGoals: 2, awayGoals: 2 })
    await client.close()
  })
})

describe('getMyPredictions', () => {
  it('returns only the caller predictions', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const other = await makeUser(db, 'u2')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await makePrediction(db, { userId: other, matchId: m, roundId, home: 0, away: 0 })
    const mine = await getMyPredictions(db, userId)
    expect(mine).toHaveLength(1)
    expect(mine[0].userId).toBe(userId)
    expect(mine[0].homeTeam).toBeDefined()
    await client.close()
  })

  it('filters by competition when an id is given', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const other = await seedCompetition(db)
    const otherRound = (await findRoundId(db, other, 'GROUP', 1)) as string
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    const m2 = await makeMatch(db, { competitionId: other, roundId: otherRound, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m1, home: 1, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m2, home: 2, away: 0 }, NOW)
    expect(await getMyPredictions(db, userId, competitionId)).toHaveLength(1)
    expect(await getMyPredictions(db, userId)).toHaveLength(2)
    await client.close()
  })
})

describe('getMyStats', () => {
  it('counts predictions and jokers per competition', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const other = await seedCompetition(db)
    const otherRound = (await findRoundId(db, other, 'GROUP', 1)) as string
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    const m3 = await makeMatch(db, { competitionId: other, roundId: otherRound, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m1, home: 1, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m2, home: 2, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m3, home: 0, away: 0 }, NOW)
    await setJoker(db, { userId, matchId: m1, isJoker: true }, NOW)

    expect(await getMyStats(db, userId, competitionId)).toEqual({ predictions: 2, jokers: 1 })
    expect(await getMyStats(db, userId, other)).toEqual({ predictions: 1, jokers: 0 })
    await client.close()
  })
})

describe('getUserPublicPredictions', () => {
  it('returns only predictions for matches that have kicked off', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const locked = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    const future = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await makePrediction(db, { userId, matchId: locked, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId, matchId: future, roundId, home: 2, away: 2 })
    const pub = await getUserPublicPredictions(db, userId, NOW)
    expect(pub).toHaveLength(1)
    expect(pub[0].matchId).toBe(locked)

    // and scopes to a competition when one is given
    const other = await seedCompetition(db)
    const otherRound = (await findRoundId(db, other, 'GROUP', 1)) as string
    const otherLocked = await makeMatch(db, { competitionId: other, roundId: otherRound, kickoffTime: PAST })
    await makePrediction(db, { userId, matchId: otherLocked, roundId: otherRound, home: 1, away: 1 })
    expect(await getUserPublicPredictions(db, userId, NOW)).toHaveLength(2)
    expect(await getUserPublicPredictions(db, userId, NOW, competitionId)).toHaveLength(1)
    await client.close()
  })

  it('includes not-yet-kicked-off picks for admins (includeUpcoming)', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const locked = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    const future = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await makePrediction(db, { userId, matchId: locked, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId, matchId: future, roundId, home: 2, away: 2 })
    expect(await getUserPublicPredictions(db, userId, NOW)).toHaveLength(1)
    expect(await getUserPublicPredictions(db, userId, NOW, competitionId, true)).toHaveLength(2)
    await client.close()
  })
})

describe('setJoker', () => {
  it('sets and unsets the joker', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await setJoker(db, { userId, matchId: m, isJoker: true }, NOW)
    expect((await db.select().from(prediction))[0].isJoker).toBe(true)
    await setJoker(db, { userId, matchId: m, isJoker: false }, NOW)
    expect((await db.select().from(prediction))[0].isJoker).toBe(false)
    await client.close()
  })

  it('moves the joker within a round (one per round)', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m1, home: 1, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m2, home: 2, away: 0 }, NOW)
    await setJoker(db, { userId, matchId: m1, isJoker: true }, NOW)
    await setJoker(db, { userId, matchId: m2, isJoker: true }, NOW)
    const preds = await db.select().from(prediction)
    expect(preds.find((p) => p.matchId === m1)!.isJoker).toBe(false)
    expect(preds.find((p) => p.matchId === m2)!.isJoker).toBe(true)
    await client.close()
  })

  it('refuses to move the joker off a match that already kicked off', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const started = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    const upcoming = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await db.insert(prediction).values({ userId, matchId: started, roundId, homeGoals: 1, awayGoals: 0, isJoker: true })
    await upsertPrediction(db, { userId, matchId: upcoming, home: 2, away: 0 }, NOW)
    await expect(setJoker(db, { userId, matchId: upcoming, isJoker: true }, NOW)).rejects.toBeInstanceOf(LockedError)
    await client.close()
  })

  it('allows re-confirming the joker on the same match', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await setJoker(db, { userId, matchId: m, isJoker: true }, NOW)
    await expect(setJoker(db, { userId, matchId: m, isJoker: true }, NOW)).resolves.toBeUndefined()
    await client.close()
  })

  it('validates match existence, lock state, and prediction existence', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    await expect(setJoker(db, { userId, matchId: 'nope', isJoker: true }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    const locked = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await expect(setJoker(db, { userId, matchId: locked, isJoker: true }, NOW)).rejects.toBeInstanceOf(LockedError)
    const noPred = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await expect(setJoker(db, { userId, matchId: noPred, isJoker: true }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('getCrowdTotals', () => {
  it('sums every prediction per match (1-1 + 2-1 + 4-0 = 7-2)', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z'), homeTeam: 'A', awayTeam: 'B', homeTeamCode: 'A', awayTeamCode: 'B' })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-16T16:00:00Z'), homeTeam: 'C', awayTeam: 'D', homeTeamCode: 'C', awayTeamCode: 'D' })
    const u1 = await makeUser(db, 'u1', 'U1')
    const u2 = await makeUser(db, 'u2', 'U2')
    const u3 = await makeUser(db, 'u3', 'U3')
    await makePrediction(db, { userId: u1, matchId: m, roundId, home: 1, away: 1 })
    await makePrediction(db, { userId: u2, matchId: m, roundId, home: 2, away: 1 })
    await makePrediction(db, { userId: u3, matchId: m, roundId, home: 4, away: 0 })
    const totals = await getCrowdTotals(db, competitionId)
    expect(totals[m]).toEqual({ home: 7, away: 2, count: 3 })
    expect(totals[m2]).toBeUndefined()
    await client.close()
  })

  it('league scope sums only the members predictions', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z') })
    const u1 = await makeUser(db, 'u1', 'U1')
    const u2 = await makeUser(db, 'u2', 'U2')
    const u3 = await makeUser(db, 'u3', 'U3')
    await makePrediction(db, { userId: u1, matchId: m, roundId, home: 1, away: 1 })
    await makePrediction(db, { userId: u2, matchId: m, roundId, home: 2, away: 1 })
    await makePrediction(db, { userId: u3, matchId: m, roundId, home: 4, away: 0 })
    const leagueId = await makeLeague(db, { competitionId, ownerId: u1 })
    await addLeagueMember(db, leagueId, u2)
    const emptyLeague = await makeLeague(db, { competitionId })

    const totals = await getCrowdTotals(db, competitionId, { leagueId })
    expect(totals[m]).toEqual({ home: 3, away: 2, count: 2 })
    expect(await getCrowdTotals(db, competitionId, { leagueId: emptyLeague })).toEqual({})
    // A member with no prediction contributes nothing.
    const u4 = await makeUser(db, 'u4', 'U4')
    await addLeagueMember(db, leagueId, u4)
    expect((await getCrowdTotals(db, competitionId, { leagueId }))[m]).toEqual({ home: 3, away: 2, count: 2 })
    await client.close()
  })
})

describe('getMatchCrowdTotal', () => {
  it('sums one match and returns zeros when nobody predicted', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T16:00:00Z') })
    expect(await getMatchCrowdTotal(db, m)).toEqual({ home: 0, away: 0, count: 0 })
    const u = await makeUser(db, 'cx', 'CX')
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 3, away: 2 })
    expect(await getMatchCrowdTotal(db, m)).toEqual({ home: 3, away: 2, count: 1 })
    await client.close()
  })
})

it('setJoker is rejected on single-match rounds (final, third place)', async () => {
  const { db, client } = await createTestDb()
  const competitionId = await seedCompetition(db)
  const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
  const m = await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: new Date('2026-07-19T16:00:00Z') })
  const u = await makeUser(db, 'jk', 'JK')
  await makePrediction(db, { userId: u, matchId: m, roundId: finalRound, home: 1, away: 0 })
  await expect(setJoker(db, { userId: u, matchId: m, isJoker: true }, new Date('2026-07-01T00:00:00Z'))).rejects.toThrow('single-match')
  await client.close()
})

it('setJoker is rejected when teams are not confirmed', async () => {
  const { db, client } = await createTestDb()
  const competitionId = await seedCompetition(db)
  const r16 = (await findRoundId(db, competitionId, 'R16', null)) as string
  const m = await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: new Date('2026-07-01T16:00:00Z'), homeTeam: 'Winner A', homeTeamCode: null, awayTeam: 'Winner B', awayTeamCode: null })
  const u = await makeUser(db, 'jk2', 'JK2')
  await makePrediction(db, { userId: u, matchId: m, roundId: r16, home: 1, away: 0 })
  await expect(setJoker(db, { userId: u, matchId: m, isJoker: true }, new Date('2026-06-20T00:00:00Z'))).rejects.toThrow('not confirmed')
  await client.close()
})
