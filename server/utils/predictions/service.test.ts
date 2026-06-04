import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { ensureRounds, findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser } from '../../../tests/factories'
import { getMyPredictions, setJoker, upsertPrediction } from './service'
import { prediction } from '../../../db/schema'
import { JokerQuotaError, LockedError, NotFoundError, ValidationError } from '../errors'

const NOW = new Date('2026-06-10T00:00:00Z')
const FUTURE = new Date('2026-06-11T16:00:00Z')
const PAST = new Date('2026-06-09T16:00:00Z')

async function setup() {
  const ctx = await createTestDb()
  await ensureRounds(ctx.db)
  const roundId = (await findRoundId(ctx.db, 'GROUP', 1)) as string
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, roundId, userId }
}

describe('upsertPrediction', () => {
  it('rejects invalid goal values', async () => {
    const { db, client, roundId, userId } = await setup()
    const m = await makeMatch(db, { roundId, kickoffTime: FUTURE })
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

  it('throws when the match is already locked', async () => {
    const { db, client, roundId, userId } = await setup()
    const m = await makeMatch(db, { roundId, kickoffTime: PAST })
    await expect(upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)).rejects.toBeInstanceOf(LockedError)
    await client.close()
  })

  it('inserts then updates a prediction in place', async () => {
    const { db, client, roundId, userId } = await setup()
    const m = await makeMatch(db, { roundId, kickoffTime: FUTURE })
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
    const { db, client, roundId, userId } = await setup()
    const other = await makeUser(db, 'u2')
    const m = await makeMatch(db, { roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await makePrediction(db, { userId: other, matchId: m, roundId, home: 0, away: 0 })
    const mine = await getMyPredictions(db, userId)
    expect(mine).toHaveLength(1)
    expect(mine[0].userId).toBe(userId)
    await client.close()
  })
})

describe('setJoker', () => {
  it('sets and unsets the joker', async () => {
    const { db, client, roundId, userId } = await setup()
    const m = await makeMatch(db, { roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await setJoker(db, { userId, matchId: m, isJoker: true }, NOW)
    expect((await db.select().from(prediction))[0].isJoker).toBe(true)
    await setJoker(db, { userId, matchId: m, isJoker: false }, NOW)
    expect((await db.select().from(prediction))[0].isJoker).toBe(false)
    await client.close()
  })

  it('enforces one joker per round', async () => {
    const { db, client, roundId, userId } = await setup()
    const m1 = await makeMatch(db, { roundId, kickoffTime: FUTURE })
    const m2 = await makeMatch(db, { roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m1, home: 1, away: 0 }, NOW)
    await upsertPrediction(db, { userId, matchId: m2, home: 2, away: 0 }, NOW)
    await setJoker(db, { userId, matchId: m1, isJoker: true }, NOW)
    await expect(setJoker(db, { userId, matchId: m2, isJoker: true }, NOW)).rejects.toBeInstanceOf(JokerQuotaError)
    await client.close()
  })

  it('allows re-confirming the joker on the same match', async () => {
    const { db, client, roundId, userId } = await setup()
    const m = await makeMatch(db, { roundId, kickoffTime: FUTURE })
    await upsertPrediction(db, { userId, matchId: m, home: 1, away: 0 }, NOW)
    await setJoker(db, { userId, matchId: m, isJoker: true }, NOW)
    await expect(setJoker(db, { userId, matchId: m, isJoker: true }, NOW)).resolves.toBeUndefined()
    await client.close()
  })

  it('validates match existence, lock state, and prediction existence', async () => {
    const { db, client, roundId, userId } = await setup()
    await expect(setJoker(db, { userId, matchId: 'nope', isJoker: true }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    const locked = await makeMatch(db, { roundId, kickoffTime: PAST })
    await expect(setJoker(db, { userId, matchId: locked, isJoker: true }, NOW)).rejects.toBeInstanceOf(LockedError)
    const noPred = await makeMatch(db, { roundId, kickoffTime: FUTURE })
    await expect(setJoker(db, { userId, matchId: noPred, isJoker: true }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})
