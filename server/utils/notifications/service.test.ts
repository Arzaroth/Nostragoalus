import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { countUnread, createNotification, listNotifications, markAllRead, markRead } from './service'
import { userNotification } from '../../../db/schema'
import type { NotificationData } from '../../../shared/types/notifications'

function leagueJoin(over: Partial<Extract<NotificationData, { type: 'LEAGUE_JOIN' }>> = {}): NotificationData {
  return { type: 'LEAGUE_JOIN', leagueId: 'lg1', leagueName: 'Friends', joinerName: 'Bob', ...over }
}

async function setup() {
  const ctx = await createTestDb()
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, userId }
}

describe('createNotification', () => {
  it('inserts and returns a DTO with the type derived from the data and read=false', async () => {
    const { db, client, userId } = await setup()
    const dto = await createNotification(db, {
      data: { type: 'CHAMPION_RESULT', competitionSlug: 'wc', competitionName: 'WC', teamName: 'Brazil', points: 40, won: true },
      userId,
    })
    expect(dto).toMatchObject({ type: 'CHAMPION_RESULT', read: false })
    expect(dto?.data).toMatchObject({ teamName: 'Brazil', points: 40 })
    expect(typeof dto?.createdAt).toBe('string')
    await client.close()
  })

  it('dedupes per user on dedupeKey: a second insert is a no-op returning null', async () => {
    const { db, client, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    const key = 'champion-awarded:wc'
    const first = await createNotification(db, { userId, data: leagueJoin(), dedupeKey: key })
    const dup = await createNotification(db, { userId, data: leagueJoin(), dedupeKey: key })
    const otherUser = await createNotification(db, { userId: u2, data: leagueJoin(), dedupeKey: key })
    expect(first).not.toBeNull()
    expect(dup).toBeNull()
    expect(otherUser).not.toBeNull()
    expect(await listNotifications(db, userId)).toHaveLength(1)
    await client.close()
  })

  it('allows multiple rows when no dedupeKey is given', async () => {
    const { db, client, userId } = await setup()
    await createNotification(db, { userId, data: leagueJoin() })
    await createNotification(db, { userId, data: leagueJoin() })
    expect(await listNotifications(db, userId)).toHaveLength(2)
    await client.close()
  })
})

describe('listNotifications', () => {
  it('returns newest first, honors limit, and paginates with before', async () => {
    const { db, client, userId } = await setup()
    const at = (iso: string) => new Date(iso)
    await db.insert(userNotification).values(
      ['2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z', '2026-06-03T00:00:00Z'].map((iso) => ({
        userId,
        type: 'LEAGUE_JOIN' as const,
        data: leagueJoin(),
        createdAt: at(iso),
      })),
    )

    const all = await listNotifications(db, userId)
    expect(all.map((n) => n.createdAt)).toEqual([
      '2026-06-03T00:00:00.000Z',
      '2026-06-02T00:00:00.000Z',
      '2026-06-01T00:00:00.000Z',
    ])

    expect(await listNotifications(db, userId, { limit: 2 })).toHaveLength(2)

    const next = await listNotifications(db, userId, { before: at('2026-06-02T00:00:00Z') })
    expect(next.map((n) => n.createdAt)).toEqual(['2026-06-01T00:00:00.000Z'])
    await client.close()
  })

  it('is scoped to the owner', async () => {
    const { db, client, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    await createNotification(db, { userId, data: leagueJoin() })
    expect(await listNotifications(db, u2)).toHaveLength(0)
    await client.close()
  })
})

describe('countUnread / markRead / markAllRead', () => {
  it('counts only unread rows for the owner', async () => {
    const { db, client, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    await createNotification(db, { userId, data: leagueJoin() })
    await createNotification(db, { userId, data: leagueJoin() })
    await createNotification(db, { userId: u2, data: leagueJoin() })
    expect(await countUnread(db, userId)).toBe(2)
    expect(await countUnread(db, u2)).toBe(1)
    await client.close()
  })

  it('markRead transitions only the given unread ids of the owner', async () => {
    const { db, client, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    const a = await createNotification(db, { userId, data: leagueJoin() })
    const b = await createNotification(db, { userId, data: leagueJoin() })
    const other = await createNotification(db, { userId: u2, data: leagueJoin() })

    expect(await markRead(db, userId, [])).toBe(0)
    // Cannot touch another user's row even with its id.
    expect(await markRead(db, userId, [other!.id])).toBe(0)
    expect(await markRead(db, userId, [a!.id, b!.id])).toBe(2)
    // Already read: no further transition.
    expect(await markRead(db, userId, [a!.id])).toBe(0)
    expect(await countUnread(db, userId)).toBe(0)
    expect(await countUnread(db, u2)).toBe(1)

    const list = await listNotifications(db, userId)
    expect(list.every((n) => n.read)).toBe(true)
    await client.close()
  })

  it('markAllRead clears every unread row for the owner only', async () => {
    const { db, client, userId } = await setup()
    const u2 = await makeUser(db, 'u2')
    await createNotification(db, { userId, data: leagueJoin() })
    await createNotification(db, { userId, data: leagueJoin() })
    await createNotification(db, { userId: u2, data: leagueJoin() })
    expect(await markAllRead(db, userId)).toBe(2)
    expect(await markAllRead(db, userId)).toBe(0)
    expect(await countUnread(db, userId)).toBe(0)
    expect(await countUnread(db, u2)).toBe(1)
    await client.close()
  })
})
