import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatMessage, chatRoomRead, competition, league, leagueMember, match, userNotification } from '../../../db/schema'
import { GLOBAL_ROOM, roomKeyFor, type ChatUnreadRoomDTO } from '../../../shared/types/chat'
import { ForbiddenError } from '../errors'
import { getMembership } from '../leagues/service'

// Per-room unread message counts across every league the caller belongs to. A
// room's window starts at their read marker (chatRoomRead) or, with none yet,
// their league join (so pre-join history never counts). Own messages, thread
// replies and non-visible messages are excluded - matching the live tracker.
async function unreadMessageRooms(db: AppDatabase, userId: string) {
  return db
    .select({
      leagueId: leagueMember.leagueId,
      leagueName: league.name,
      competitionSlug: competition.slug,
      matchId: chatMessage.matchId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      unread: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${chatMessage.createdAt})`,
    })
    .from(leagueMember)
    .innerJoin(league, eq(league.id, leagueMember.leagueId))
    .innerJoin(competition, eq(competition.id, league.competitionId))
    .innerJoin(chatMessage, eq(chatMessage.leagueId, leagueMember.leagueId))
    .leftJoin(match, eq(match.id, chatMessage.matchId))
    .leftJoin(
      chatRoomRead,
      and(
        eq(chatRoomRead.userId, leagueMember.userId),
        eq(chatRoomRead.leagueId, chatMessage.leagueId),
        eq(chatRoomRead.roomKey, sql`coalesce(${chatMessage.matchId}, ${GLOBAL_ROOM})`),
      ),
    )
    .where(
      and(
        eq(leagueMember.userId, userId),
        ne(chatMessage.userId, userId),
        isNull(chatMessage.threadId),
        eq(chatMessage.moderationState, 'VISIBLE'),
        sql`${chatMessage.createdAt} > coalesce(${chatRoomRead.lastReadAt}, ${leagueMember.joinedAt})`,
      ),
    )
    .groupBy(leagueMember.leagueId, league.name, competition.slug, chatMessage.matchId, match.homeTeam, match.awayTeam)
}

// Unread @mentions of the caller, grouped per room. Mentions are not stored on
// the message (E2EE); the durable record is the CHAT_MENTION bell row, which
// carries the room context in its data bag - so the inbox reads them from there.
async function unreadMentionRooms(db: AppDatabase, userId: string) {
  const data = userNotification.data
  return db
    .select({
      leagueId: sql<string>`${data}->>'leagueId'`,
      matchId: sql<string | null>`${data}->>'matchId'`,
      leagueName: sql<string>`max(${data}->>'leagueName')`,
      competitionSlug: sql<string>`max(${data}->>'competitionSlug')`,
      homeTeam: sql<string | null>`max(${data}->>'homeTeam')`,
      awayTeam: sql<string | null>`max(${data}->>'awayTeam')`,
      mentions: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${userNotification.createdAt})`,
    })
    .from(userNotification)
    .where(
      and(
        eq(userNotification.userId, userId),
        eq(userNotification.type, 'CHAT_MENTION'),
        isNull(userNotification.readAt),
      ),
    )
    .groupBy(sql`${data}->>'leagueId'`, sql`${data}->>'matchId'`)
}

// The cross-league chat inbox: every room (league-global or match thread) with
// unread messages and/or unread mentions for the caller, newest activity first.
// Survives reload because it is recomputed from the persisted read markers, not
// from a live session counter.
export async function getUnreadRooms(db: AppDatabase, userId: string): Promise<ChatUnreadRoomDTO[]> {
  const [messageRooms, mentionRooms] = await Promise.all([
    unreadMessageRooms(db, userId),
    unreadMentionRooms(db, userId),
  ])

  const byKey = new Map<string, ChatUnreadRoomDTO>()
  const keyOf = (leagueId: string, roomKey: string) => `${leagueId}::${roomKey}`

  for (const r of messageRooms) {
    const roomKey = roomKeyFor(r.matchId)
    byKey.set(keyOf(r.leagueId, roomKey), {
      leagueId: r.leagueId,
      leagueName: r.leagueName,
      competitionSlug: r.competitionSlug,
      roomKey,
      matchId: r.matchId,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      unread: r.unread,
      mentions: 0,
      lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
    })
  }

  // Overlay mention counts. A mention's room is normally already present from the
  // message pass (the mention IS a message newer than the marker); if not (e.g. a
  // moderated-away message), seed the room from the notification's own context.
  for (const m of mentionRooms) {
    const roomKey = m.matchId ?? GLOBAL_ROOM
    const key = keyOf(m.leagueId, roomKey)
    const existing = byKey.get(key)
    if (existing) {
      existing.mentions = m.mentions
    } else {
      byKey.set(key, {
        leagueId: m.leagueId,
        leagueName: m.leagueName,
        competitionSlug: m.competitionSlug,
        roomKey,
        matchId: m.matchId,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        unread: 0,
        mentions: m.mentions,
        lastAt: m.lastAt ? new Date(m.lastAt).toISOString() : null,
      })
    }
  }

  return [...byKey.values()].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
}

// Mark a room read up to now (server clock - never trust a client timestamp). Also
// clears that room's unread @mention bell rows, so opening the room dismisses the
// mention everywhere at once and a reload shows the room fully clear (parity with
// the live tracker, which clears both counters on view). Members only.
export async function markRoomRead(
  db: AppDatabase,
  userId: string,
  opts: { leagueId: string; roomKey: string },
): Promise<void> {
  const membership = await getMembership(db, opts.leagueId, userId)
  if (!membership) throw new ForbiddenError('not a league member')

  const now = new Date()
  await db
    .insert(chatRoomRead)
    .values({ userId, leagueId: opts.leagueId, roomKey: opts.roomKey, lastReadAt: now })
    .onConflictDoUpdate({
      target: [chatRoomRead.userId, chatRoomRead.leagueId, chatRoomRead.roomKey],
      set: { lastReadAt: now },
    })

  const data = userNotification.data
  const matchMatches =
    opts.roomKey === GLOBAL_ROOM ? sql`${data}->>'matchId' is null` : sql`${data}->>'matchId' = ${opts.roomKey}`
  await db
    .update(userNotification)
    .set({ readAt: now })
    .where(
      and(
        eq(userNotification.userId, userId),
        eq(userNotification.type, 'CHAT_MENTION'),
        isNull(userNotification.readAt),
        sql`${data}->>'leagueId' = ${opts.leagueId}`,
        matchMatches,
      ),
    )
}
