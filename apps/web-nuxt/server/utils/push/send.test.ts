import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { user } from '../../../db/schema'
import type { NotificationData } from '../../../shared/types/notifications'
import { saveSubscription } from './service'
import { pushNotification } from './send'

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

const reminder: NotificationData = {
  type: 'PICK_REMINDER',
  matchId: 'm1',
  competitionSlug: 'wc',
  homeTeam: 'A',
  awayTeam: 'B',
  kickoffTime: 'x',
}
const leagueJoin: NotificationData = { type: 'LEAGUE_JOIN', leagueId: 'l1', leagueName: 'F', joinerName: 'Bob' }

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue(undefined)
})
afterEach(() => setVapid(false))

async function setup() {
  const ctx = await createTestDb()
  const u = await makeUser(ctx.db, 'u1')
  await saveSubscription(ctx.db, u, { endpoint: 'https://push/e1', keys: { p256dh: 'k', auth: 'a' } })
  return { ...ctx, u }
}

describe('pushNotification', () => {
  // Runs first, before any test configures VAPID, so the unconfigured branch is real.
  it('is a no-op when VAPID is not configured', async () => {
    setVapid(false)
    const { db, client, u } = await setup()
    expect(await pushNotification(db, u, reminder)).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()
    await client.close()
  })

  it('sends to each subscription for a default-on category', async () => {
    setVapid(true)
    const { db, client, u } = await setup()
    expect(await pushNotification(db, u, reminder)).toBe(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('respects a category toggle (league is off by default, on when enabled)', async () => {
    setVapid(true)
    const { db, client, u } = await setup()
    expect(await pushNotification(db, u, leagueJoin)).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()

    await db.update(user).set({ pushLeague: true }).where(eq(user.id, u))
    expect(await pushNotification(db, u, leagueJoin)).toBe(1)
    expect(sendMock).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('returns 0 when the user has no subscriptions', async () => {
    setVapid(true)
    const ctx = await createTestDb()
    const u = await makeUser(ctx.db, 'lonely')
    expect(await pushNotification(ctx.db, u, reminder)).toBe(0)
    await ctx.client.close()
  })

  it('prunes a subscription the push service reports as gone (410)', async () => {
    setVapid(true)
    const { db, client, u } = await setup()
    sendMock.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }))
    expect(await pushNotification(db, u, reminder)).toBe(0)
    // The dead endpoint was removed.
    const remaining = await db.select().from(user) // sanity: user still exists
    expect(remaining).toHaveLength(1)
    expect(await pushNotification(db, u, reminder)).toBe(0)
    expect(sendMock).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('prunes a subscription reported as gone (404)', async () => {
    setVapid(true)
    const { db, client, u } = await setup()
    sendMock.mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }))
    expect(await pushNotification(db, u, reminder)).toBe(0)
    // Pruned: a second send finds no subscription.
    expect(await pushNotification(db, u, reminder)).toBe(0)
    expect(sendMock).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('keeps the subscription on a transient (non-404/410) error', async () => {
    setVapid(true)
    const { db, client, u } = await setup()
    sendMock.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { statusCode: 429 }))
    expect(await pushNotification(db, u, reminder)).toBe(0)
    // Not pruned: the next attempt still has the subscription and succeeds.
    expect(await pushNotification(db, u, reminder)).toBe(1)
    expect(sendMock).toHaveBeenCalledTimes(2)
    await client.close()
  })

  it('is a no-op for an unknown user (no prefs row)', async () => {
    setVapid(true)
    const ctx = await createTestDb()
    expect(await pushNotification(ctx.db, 'ghost', reminder)).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()
    await ctx.client.close()
  })
})
