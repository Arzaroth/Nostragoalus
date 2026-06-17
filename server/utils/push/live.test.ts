import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import type { MatchTransition } from '../sync/upsert-matches'
import { saveSubscription } from './service'
import { notifyLiveMatchEvents } from './live'

const sendMock = vi.fn()
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendMock(...args) },
}))

const VAPID: Record<string, string> = {
  NUXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub',
  NUXT_VAPID_PRIVATE_KEY: 'priv',
  NUXT_VAPID_SUBJECT: 'mailto:x@example.com',
}
function setVapid(on: boolean) {
  for (const k of Object.keys(VAPID)) {
    if (on) process.env[k] = VAPID[k]
    else delete process.env[k]
  }
}

function transition(over: Partial<MatchTransition>): MatchTransition {
  return {
    matchId: 'm1',
    homeTeam: 'Spain',
    awayTeam: 'Brazil',
    prevStatus: 'SCHEDULED',
    status: 'LIVE',
    prevHome: null,
    prevAway: null,
    home: null,
    away: null,
    ...over,
  }
}

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue(undefined)
})
afterEach(() => setVapid(false))

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const matchId = await makeMatch(ctx.db, {
    competitionId,
    roundId,
    kickoffTime: new Date('2026-06-15T18:00:00Z'),
    homeTeam: 'Spain',
    awayTeam: 'Brazil',
  })
  const predictor = await makeUser(ctx.db, 'p1')
  const bystander = await makeUser(ctx.db, 'p2')
  await makePrediction(ctx.db, { userId: predictor, matchId, roundId, home: 1, away: 0 })
  await saveSubscription(ctx.db, predictor, { endpoint: 'https://push/e1', keys: { p256dh: 'k', auth: 'a' } })
  // bystander is subscribed but did NOT predict this match.
  await saveSubscription(ctx.db, bystander, { endpoint: 'https://push/e2', keys: { p256dh: 'k', auth: 'a' } })
  return { ...ctx, matchId }
}

describe('notifyLiveMatchEvents', () => {
  it('pushes a kickoff to predictors only', async () => {
    setVapid(true)
    const { db, client, matchId } = await setup()
    await notifyLiveMatchEvents(db, 'world-cup-2026', [transition({ matchId })])
    expect(sendMock).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(sendMock.mock.calls[0]![1] as string)
    expect(payload.body).toContain('started')
    expect(payload.url).toBe(`/world-cup-2026/matches/${matchId}`)
    await client.close()
  })

  it('pushes a goal when the live score increases', async () => {
    setVapid(true)
    const { db, client, matchId } = await setup()
    await notifyLiveMatchEvents(db, 'world-cup-2026', [
      transition({ matchId, prevStatus: 'LIVE', status: 'LIVE', prevHome: 0, prevAway: 0, home: 1, away: 0 }),
    ])
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sendMock.mock.calls[0]![1] as string).title).toMatch(/GOAL/i)
    await client.close()
  })

  it('ignores transitions that are neither a kickoff nor a goal', async () => {
    setVapid(true)
    const { db, client, matchId } = await setup()
    await notifyLiveMatchEvents(db, 'world-cup-2026', [
      // full-time, score unchanged
      transition({ matchId, prevStatus: 'LIVE', status: 'FINISHED', prevHome: 1, prevAway: 0, home: 1, away: 0 }),
    ])
    expect(sendMock).not.toHaveBeenCalled()
    await client.close()
  })

  it('is a no-op when push is not configured', async () => {
    setVapid(false)
    const { db, client, matchId } = await setup()
    await notifyLiveMatchEvents(db, 'world-cup-2026', [transition({ matchId })])
    expect(sendMock).not.toHaveBeenCalled()
    await client.close()
  })

  it('skips a kickoff/goal for a match nobody predicted', async () => {
    setVapid(true)
    const { db, client } = await setup()
    // A real kickoff transition, but for a match with no predictions.
    await notifyLiveMatchEvents(db, 'world-cup-2026', [transition({ matchId: 'unpredicted' })])
    expect(sendMock).not.toHaveBeenCalled()
    await client.close()
  })
})
