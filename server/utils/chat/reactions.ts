import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatMessage, chatMessageReaction } from '../../../db/schema'
import { REACTION_EMOJIS, emptyReactionTotals, type ReactionEmoji, type ReactionTotals } from '../../../shared/reactions'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { getMembership } from '../leagues/service'

// Emoji reactions on chat messages mirror match reactions: one per member per
// message, changeable, toggled off by passing null. Only the glyph is stored -
// never anything about the encrypted message it sits on.

async function messageLeague(db: AppDatabase, messageId: string): Promise<string> {
  const rows = await db.select({ leagueId: chatMessage.leagueId }).from(chatMessage).where(eq(chatMessage.id, messageId)).limit(1)
  if (!rows[0]) throw new NotFoundError('message not found')
  return rows[0].leagueId
}

// Set (or clear, when emoji is null) the caller's reaction on a message. Returns
// the message's league so the route can fan the new totals out to its members.
// Members only; the message must belong to the given league.
export async function setChatReaction(
  db: AppDatabase,
  opts: { leagueId: string; messageId: string; userId: string; emoji: ReactionEmoji | null },
): Promise<{ leagueId: string }> {
  if (opts.emoji !== null && !REACTION_EMOJIS.includes(opts.emoji)) throw new ValidationError('unknown reaction')
  const leagueId = await messageLeague(db, opts.messageId)
  if (leagueId !== opts.leagueId) throw new NotFoundError('message not found')
  const membership = await getMembership(db, leagueId, opts.userId)
  if (!membership) throw new ForbiddenError('not a league member')
  if (opts.emoji === null) {
    await db
      .delete(chatMessageReaction)
      .where(and(eq(chatMessageReaction.messageId, opts.messageId), eq(chatMessageReaction.userId, opts.userId)))
    return { leagueId }
  }
  await db
    .insert(chatMessageReaction)
    .values({ userId: opts.userId, messageId: opts.messageId, emoji: opts.emoji })
    .onConflictDoUpdate({
      target: [chatMessageReaction.userId, chatMessageReaction.messageId],
      set: { emoji: opts.emoji, updatedAt: new Date() },
    })
  return { leagueId }
}

// Per-emoji totals for a single message (zeros included), for a live push.
export async function getMessageReactionTotals(db: AppDatabase, messageId: string): Promise<ReactionTotals> {
  const map = await getReactionTotals(db, [messageId])
  return map[messageId] ?? emptyReactionTotals()
}

// Per-emoji totals for a set of messages, keyed by message id (zeros included for
// every requested id). One grouped query for the whole page.
export async function getReactionTotals(db: AppDatabase, messageIds: string[]): Promise<Record<string, ReactionTotals>> {
  const totals: Record<string, ReactionTotals> = {}
  for (const id of messageIds) totals[id] = emptyReactionTotals()
  if (messageIds.length === 0) return totals
  const rows = await db
    .select({
      messageId: chatMessageReaction.messageId,
      emoji: chatMessageReaction.emoji,
      count: sql<number>`count(*)::int`,
    })
    .from(chatMessageReaction)
    .where(inArray(chatMessageReaction.messageId, messageIds))
    .groupBy(chatMessageReaction.messageId, chatMessageReaction.emoji)
  for (const r of rows) totals[r.messageId][r.emoji as ReactionEmoji] = r.count
  return totals
}

// The caller's own reaction per message (only messages they reacted to appear).
export async function getMyReactions(
  db: AppDatabase,
  userId: string,
  messageIds: string[],
): Promise<Record<string, ReactionEmoji>> {
  const mine: Record<string, ReactionEmoji> = {}
  if (messageIds.length === 0) return mine
  const rows = await db
    .select({ messageId: chatMessageReaction.messageId, emoji: chatMessageReaction.emoji })
    .from(chatMessageReaction)
    .where(and(eq(chatMessageReaction.userId, userId), inArray(chatMessageReaction.messageId, messageIds)))
  for (const r of rows) mine[r.messageId] = r.emoji as ReactionEmoji
  return mine
}
