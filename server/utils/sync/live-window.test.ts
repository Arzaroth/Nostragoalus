import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { ensureRounds, findRoundId } from './rounds'
import { hasLiveWindow, lockDuePredictions, unlockFuturePredictions } from './live-window'
import { makeMatch, makePrediction, makeUser } from '../../../tests/factories'
import { prediction } from '../../../db/schema'

const NOW = new Date('2026-06-11T20:00:00Z')

async function setup() {
  const ctx = await createTestDb()
  await ensureRounds(ctx.db)
  const roundId = (await findRoundId(ctx.db, 'GROUP', 1)) as string
  return { ...ctx, roundId }
}

describe('hasLiveWindow', () => {
  it('is false with no matches', async () => {
    const { db, client } = await setup()
    expect(await hasLiveWindow(db, NOW)).toBe(false)
    await client.close()
  })

  it('is true for an in-play match', async () => {
    const { db, client, roundId } = await setup()
    await makeMatch(db, { roundId, kickoffTime: new Date('2026-06-11T19:00:00Z'), status: 'IN_PLAY' })
    expect(await hasLiveWindow(db, NOW)).toBe(true)
    await client.close()
  })

  it('is true for a scheduled match that kicked off within the last 4 hours', async () => {
    const { db, client, roundId } = await setup()
    await makeMatch(db, { roundId, kickoffTime: new Date('2026-06-11T19:00:00Z'), status: 'SCHEDULED' })
    expect(await hasLiveWindow(db, NOW)).toBe(true)
    await client.close()
  })

  it('is false for future or long-past scheduled matches', async () => {
    const { db, client, roundId } = await setup()
    await makeMatch(db, { roundId, kickoffTime: new Date('2026-06-11T23:00:00Z'), status: 'SCHEDULED' })
    await makeMatch(db, { roundId, kickoffTime: new Date('2026-06-11T10:00:00Z'), status: 'SCHEDULED' })
    expect(await hasLiveWindow(db, NOW)).toBe(false)
    await client.close()
  })
})

describe('prediction locking', () => {
  it('locks predictions whose kickoff has passed and unlocks future ones', async () => {
    const { db, client, roundId } = await setup()
    const u = await makeUser(db, 'u1')
    const past = await makeMatch(db, { roundId, kickoffTime: new Date('2026-06-11T16:00:00Z') })
    const future = await makeMatch(db, { roundId, kickoffTime: new Date('2026-06-12T16:00:00Z') })
    const pPast = await makePrediction(db, { userId: u, matchId: past, roundId, home: 1, away: 0 })
    const pFuture = await makePrediction(db, { userId: u, matchId: future, roundId, home: 2, away: 2, lockedAt: NOW })

    expect(await lockDuePredictions(db, NOW)).toBe(1)
    expect(await unlockFuturePredictions(db, NOW)).toBe(1)

    const rows = await db.select().from(prediction)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId[pPast].lockedAt).not.toBeNull()
    expect(byId[pFuture].lockedAt).toBeNull()
    await client.close()
  })
})
