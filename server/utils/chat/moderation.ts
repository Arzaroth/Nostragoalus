import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatMessage, chatMessageReport, leagueMember } from '../../../db/schema'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { getMembership } from '../leagues/service'
import type { ChatModerationState } from '../../../shared/types/chat'

// Distinct reports that auto-hide a message: a quarter of the league, but never
// fewer than three, so a tiny league still needs a real chorus, not one grudge.
export function pendingThreshold(memberCount: number): number {
  return Math.max(3, Math.ceil(memberCount * 0.25))
}

function assertAdmin(membership: { role: string } | null): void {
  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'MODERATOR')) {
    throw new ForbiddenError('only the league owner or a moderator can do this')
  }
}

async function memberCount(db: AppDatabase, leagueId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leagueMember)
    .where(eq(leagueMember.leagueId, leagueId))
  return rows[0]?.n ?? 0
}

async function reportCount(db: AppDatabase, messageId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessageReport)
    .where(eq(chatMessageReport.messageId, messageId))
  return rows[0]?.n ?? 0
}

// A member reports a message. Once enough distinct members have reported a still
// VISIBLE message, it auto-flips to PENDING (hidden from non-moderators). Members
// only; you cannot report your own message. Returns the resulting state + count.
export async function reportMessage(
  db: AppDatabase,
  opts: { leagueId: string; messageId: string; userId: string },
): Promise<{ state: ChatModerationState; reports: number }> {
  const rows = await db
    .select({ leagueId: chatMessage.leagueId, userId: chatMessage.userId, state: chatMessage.moderationState })
    .from(chatMessage)
    .where(eq(chatMessage.id, opts.messageId))
    .limit(1)
  if (!rows[0] || rows[0].leagueId !== opts.leagueId) throw new NotFoundError('message not found')
  const membership = await getMembership(db, opts.leagueId, opts.userId)
  if (!membership) throw new ForbiddenError('not a league member')
  if (rows[0].userId === opts.userId) throw new ValidationError('cannot report your own message')

  await db.insert(chatMessageReport).values({ messageId: opts.messageId, reporterId: opts.userId }).onConflictDoNothing()
  const reports = await reportCount(db, opts.messageId)
  let state = rows[0].state as ChatModerationState
  if (state === 'VISIBLE' && reports >= pendingThreshold(await memberCount(db, opts.leagueId))) {
    await db.update(chatMessage).set({ moderationState: 'PENDING' }).where(eq(chatMessage.id, opts.messageId))
    state = 'PENDING'
  }
  return { state, reports }
}

// Owner/moderator rules on a message: 'remove' tombstones it (content gone for
// everyone), 'restore' clears the reports and makes it VISIBLE again (dismiss).
export async function moderateMessage(
  db: AppDatabase,
  opts: { leagueId: string; messageId: string; actorId: string; action: 'remove' | 'restore' },
): Promise<{ state: ChatModerationState }> {
  const rows = await db
    .select({ leagueId: chatMessage.leagueId })
    .from(chatMessage)
    .where(eq(chatMessage.id, opts.messageId))
    .limit(1)
  if (!rows[0] || rows[0].leagueId !== opts.leagueId) throw new NotFoundError('message not found')
  assertAdmin(await getMembership(db, opts.leagueId, opts.actorId))
  const state: ChatModerationState = opts.action === 'remove' ? 'REMOVED' : 'VISIBLE'
  await db.transaction(async (tx) => {
    await tx
      .update(chatMessage)
      .set({ moderationState: state, moderatedBy: opts.actorId, moderatedAt: new Date() })
      .where(eq(chatMessage.id, opts.messageId))
    // Dismissing (restore) clears the reports so the message does not immediately
    // re-pend on the next single report.
    if (opts.action === 'restore') {
      await tx.delete(chatMessageReport).where(eq(chatMessageReport.messageId, opts.messageId))
    }
  })
  return { state }
}

export interface ReportedMessage {
  id: string
  userId: string | null
  matchId: string | null
  epoch: number
  ciphertext: string
  moderationState: ChatModerationState
  reports: number
  createdAt: Date
}

// The moderation queue for owner/moderators: every message with at least one
// report (or already pending), most-reported first. The ciphertext rides along so
// a moderator can decrypt and read it before deciding; the server stays blind.
export async function listReports(
  db: AppDatabase,
  opts: { leagueId: string; actorId: string },
): Promise<ReportedMessage[]> {
  assertAdmin(await getMembership(db, opts.leagueId, opts.actorId))
  const rows = await db
    .select({
      id: chatMessage.id,
      userId: chatMessage.userId,
      matchId: chatMessage.matchId,
      epoch: chatMessage.epoch,
      ciphertext: chatMessage.ciphertext,
      moderationState: chatMessage.moderationState,
      createdAt: chatMessage.createdAt,
      reports: sql<number>`count(${chatMessageReport.id})::int`,
    })
    .from(chatMessage)
    .innerJoin(chatMessageReport, eq(chatMessageReport.messageId, chatMessage.id))
    .where(eq(chatMessage.leagueId, opts.leagueId))
    .groupBy(chatMessage.id)
    .orderBy(desc(sql`count(${chatMessageReport.id})`), desc(chatMessage.createdAt))
  return rows.map((r) => ({ ...r, moderationState: r.moderationState as ChatModerationState }))
}

// Whether the caller has already reported each of these messages (so the client
// can disable the report control). Empty for an empty id list.
export async function getMyReports(db: AppDatabase, userId: string, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set()
  const rows = await db
    .select({ messageId: chatMessageReport.messageId })
    .from(chatMessageReport)
    .where(and(eq(chatMessageReport.reporterId, userId), inArray(chatMessageReport.messageId, messageIds)))
  return new Set(rows.map((r) => r.messageId))
}
