import { describe, it, expect } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeLeague, makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { chatMessage, chatRoomRead, leagueMember, userNotification } from '../../../db/schema'
import { getRoomReadMarker, getUnreadRooms, markRoomRead } from './unread'
import { ForbiddenError } from '../errors'
import type { NotificationData } from '../../../shared/types/notifications'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']
type Moderation = 'VISIBLE' | 'PENDING' | 'REMOVED'
const T = (iso: string) => new Date(iso)
const JOIN = T('2026-01-01T00:00:00Z')

async function addMsg(
  db: Db,
  o: { leagueId: string; userId: string; matchId?: string | null; at: Date; moderation?: Moderation; threadId?: string | null },
): Promise<string> {
  const [r] = await db
    .insert(chatMessage)
    .values({
      leagueId: o.leagueId,
      userId: o.userId,
      matchId: o.matchId ?? null,
      epoch: 1,
      ciphertext: 'x',
      createdAt: o.at,
      moderationState: o.moderation ?? 'VISIBLE',
      threadId: o.threadId ?? null,
    })
    .returning({ id: chatMessage.id })
  return r.id
}

async function addMention(
  db: Db,
  userId: string,
  over: Partial<Extract<NotificationData, { type: 'CHAT_MENTION' }>> & { leagueId: string },
  readAt: Date | null = null,
): Promise<void> {
  const data: Extract<NotificationData, { type: 'CHAT_MENTION' }> = {
    type: 'CHAT_MENTION',
    leagueId: over.leagueId,
    leagueName: over.leagueName ?? 'L',
    competitionSlug: over.competitionSlug ?? 'wc',
    matchId: over.matchId ?? null,
    homeTeam: over.homeTeam ?? null,
    awayTeam: over.awayTeam ?? null,
    senderId: over.senderId ?? 'other',
    senderName: over.senderName ?? 'Other',
  }
  await db.insert(userNotification).values({ userId, type: 'CHAT_MENTION', data, readAt })
}

// `me` + `other` both members of league L1 (no auto-owner so joinedAt is fixed).
async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db, { slug: 'wc' })
  const me = await makeUser(ctx.db, 'me', 'Me')
  const other = await makeUser(ctx.db, 'other', 'Other')
  const l1 = await makeLeague(ctx.db, { competitionId, name: 'L1' })
  await ctx.db.insert(leagueMember).values([
    { leagueId: l1, userId: me, role: 'OWNER', joinedAt: JOIN },
    { leagueId: l1, userId: other, role: 'MEMBER', joinedAt: JOIN },
  ])
  return { ...ctx, competitionId, me, other, l1 }
}

function room(rooms: Awaited<ReturnType<typeof getUnreadRooms>>, roomKey: string) {
  return rooms.find((r) => r.roomKey === roomKey)
}

describe('getUnreadRooms', () => {
  it('counts unread per room, excluding own, thread replies and moderated', async () => {
    const { db, client, competitionId, me, other, l1 } = await setup()
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const matchId = await makeMatch(db, { competitionId, roundId, kickoffTime: JOIN, homeTeam: 'France', awayTeam: 'Brazil' })

    // Global room: two unread from `other`; one of my own and a removed one ignored.
    await addMsg(db, { leagueId: l1, userId: other, at: T('2026-02-01T10:00:00Z') })
    await addMsg(db, { leagueId: l1, userId: other, at: T('2026-02-01T11:00:00Z') })
    await addMsg(db, { leagueId: l1, userId: me, at: T('2026-02-01T12:00:00Z') })
    await addMsg(db, { leagueId: l1, userId: other, at: T('2026-02-01T13:00:00Z'), moderation: 'REMOVED' })
    // A thread reply (threadId set) is not main-list activity.
    const root = await addMsg(db, { leagueId: l1, userId: me, at: T('2026-02-01T09:00:00Z') })
    await addMsg(db, { leagueId: l1, userId: other, at: T('2026-02-01T14:00:00Z'), threadId: root })
    // Match thread: one unread.
    await addMsg(db, { leagueId: l1, userId: other, matchId, at: T('2026-02-02T10:00:00Z') })

    const rooms = await getUnreadRooms(db, me)
    expect(rooms).toHaveLength(2)
    expect(room(rooms, '__global__')).toMatchObject({ leagueId: l1, matchId: null, unread: 2, mentions: 0 })
    expect(room(rooms, matchId)).toMatchObject({ matchId, unread: 1, homeTeam: 'France', awayTeam: 'Brazil' })
    await client.close()
  })

  it('floors unread at the league join and respects the read marker', async () => {
    const { db, client, me, other, l1 } = await setup()
    // Before join: ignored.
    await addMsg(db, { leagueId: l1, userId: other, at: T('2025-12-01T00:00:00Z') })
    // After join but before the marker: read.
    await addMsg(db, { leagueId: l1, userId: other, at: T('2026-02-01T00:00:00Z') })
    await db
      .insert(chatRoomRead)
      .values({ userId: me, leagueId: l1, roomKey: '__global__', lastReadAt: T('2026-02-05T00:00:00Z') })
    // After the marker: unread.
    await addMsg(db, { leagueId: l1, userId: other, at: T('2026-02-10T00:00:00Z') })

    const rooms = await getUnreadRooms(db, me)
    expect(room(rooms, '__global__')).toMatchObject({ unread: 1 })
    await client.close()
  })

  it('aggregates rooms across multiple leagues and overlays mention counts', async () => {
    const { db, client, competitionId, me, other, l1 } = await setup()
    const l2 = await makeLeague(db, { competitionId, name: 'L2' })
    await db.insert(leagueMember).values([
      { leagueId: l2, userId: me, role: 'MEMBER', joinedAt: JOIN },
      { leagueId: l2, userId: other, role: 'OWNER', joinedAt: JOIN },
    ])
    await addMsg(db, { leagueId: l1, userId: other, at: T('2026-03-01T00:00:00Z') })
    await addMsg(db, { leagueId: l2, userId: other, at: T('2026-03-02T00:00:00Z') })
    await addMention(db, me, { leagueId: l1, leagueName: 'L1' })

    const rooms = await getUnreadRooms(db, me)
    expect(rooms.map((r) => r.leagueId).sort()).toEqual([l1, l2].sort())
    // L2 is the newer activity, so it sorts first.
    expect(rooms[0].leagueId).toBe(l2)
    const l1Global = rooms.find((r) => r.leagueId === l1 && r.roomKey === '__global__')!
    const l2Global = rooms.find((r) => r.leagueId === l2 && r.roomKey === '__global__')!
    expect(l1Global.mentions).toBe(1)
    expect(l2Global.mentions).toBe(0)
    await client.close()
  })

  it('seeds a mention-only room when its message is gone', async () => {
    const { db, client, me, l1 } = await setup()
    // No unread message, just an unread mention -> the room still surfaces.
    await addMention(db, me, { leagueId: l1, leagueName: 'L1', competitionSlug: 'wc' })
    const rooms = await getUnreadRooms(db, me)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]).toMatchObject({ leagueId: l1, roomKey: '__global__', unread: 0, mentions: 1 })
    await client.close()
  })
})

describe('getRoomReadMarker', () => {
  it('is null before the room is opened, then the marker time after', async () => {
    const { db, client, me, l1 } = await setup()
    expect(await getRoomReadMarker(db, me, l1, '__global__')).toBeNull()
    await markRoomRead(db, me, { leagueId: l1, roomKey: '__global__' })
    const marker = await getRoomReadMarker(db, me, l1, '__global__')
    expect(marker).not.toBeNull()
    expect(new Date(marker!).getTime()).not.toBeNaN()
    await client.close()
  })

  it('is scoped per room and per user', async () => {
    const { db, client, competitionId, me, other, l1 } = await setup()
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const matchId = await makeMatch(db, { competitionId, roundId, kickoffTime: JOIN })
    await db
      .insert(chatRoomRead)
      .values({ userId: me, leagueId: l1, roomKey: matchId, lastReadAt: T('2026-02-05T00:00:00Z') })
    // Right room for me.
    expect(await getRoomReadMarker(db, me, l1, matchId)).toBe(T('2026-02-05T00:00:00Z').toISOString())
    // A different room I never opened, and another user, are both null.
    expect(await getRoomReadMarker(db, me, l1, '__global__')).toBeNull()
    expect(await getRoomReadMarker(db, other, l1, matchId)).toBeNull()
    await client.close()
  })
})

describe('markRoomRead', () => {
  it('upserts the marker to now and is repeatable', async () => {
    const { db, client, me, l1 } = await setup()
    await markRoomRead(db, me, { leagueId: l1, roomKey: '__global__' })
    const first = await db
      .select()
      .from(chatRoomRead)
      .where(and(eq(chatRoomRead.userId, me), eq(chatRoomRead.leagueId, l1)))
    expect(first).toHaveLength(1)
    await markRoomRead(db, me, { leagueId: l1, roomKey: '__global__' })
    const again = await db.select().from(chatRoomRead).where(eq(chatRoomRead.userId, me))
    expect(again).toHaveLength(1) // upsert, not a second row
    await client.close()
  })

  it('clears that room mentions only (global vs match scoped)', async () => {
    const { db, client, competitionId, me, l1 } = await setup()
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const matchId = await makeMatch(db, { competitionId, roundId, kickoffTime: JOIN })
    await addMention(db, me, { leagueId: l1, leagueName: 'L1' }) // global
    await addMention(db, me, { leagueId: l1, leagueName: 'L1', matchId }) // match thread

    await markRoomRead(db, me, { leagueId: l1, roomKey: matchId })
    const stillUnread = await db
      .select()
      .from(userNotification)
      .where(and(eq(userNotification.userId, me), isNull(userNotification.readAt)))
    expect(stillUnread).toHaveLength(1) // only the global mention remains unread

    await markRoomRead(db, me, { leagueId: l1, roomKey: '__global__' })
    const none = await db
      .select()
      .from(userNotification)
      .where(and(eq(userNotification.userId, me), isNull(userNotification.readAt)))
    expect(none).toHaveLength(0)
    await client.close()
  })

  it('forbids a non-member', async () => {
    const { db, client, l1 } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(markRoomRead(db, stranger, { leagueId: l1, roomKey: '__global__' })).rejects.toBeInstanceOf(
      ForbiddenError,
    )
    await client.close()
  })
})
