import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leagueMember, match, matchReaction } from '../../../db/schema'
import { emptyReactionTotals, isReactionEmoji, type ReactionEmoji, type ReactionTotals } from '../../../shared/reactions'
import { NotFoundError, ValidationError } from '../errors'

export interface SetReactionInput {
  userId: string
  matchId: string
  // null clears the caller's reaction (toggle off).
  emoji: ReactionEmoji | null
}

// React to a match (one per user, changeable). Reactions open at kickoff and
// stay open after full-time - there are no pre-match reactions.
export async function setReaction(db: AppDatabase, input: SetReactionInput, now: Date = new Date()): Promise<void> {
  if (input.emoji !== null && !isReactionEmoji(input.emoji)) throw new ValidationError('unknown reaction')

  const rows = await db.select({ kickoffTime: match.kickoffTime }).from(match).where(eq(match.id, input.matchId)).limit(1)
  if (rows.length === 0) throw new NotFoundError('match not found')
  if (now < rows[0].kickoffTime) throw new ValidationError('match has not kicked off yet')

  if (input.emoji === null) {
    await db
      .delete(matchReaction)
      .where(and(eq(matchReaction.userId, input.userId), eq(matchReaction.matchId, input.matchId)))
    return
  }

  // Atomic upsert on the (userId, matchId) unique index: a double-tap or a
  // change of heart rewrites the emoji instead of racing the constraint to a 500.
  await db
    .insert(matchReaction)
    .values({ userId: input.userId, matchId: input.matchId, emoji: input.emoji })
    .onConflictDoUpdate({
      target: [matchReaction.userId, matchReaction.matchId],
      set: { emoji: input.emoji },
    })
}

// Count per emoji for one match (full record, zeros included so the client can
// merge live patches without missing-key checks). League scope is display-only,
// mirroring crowd totals: it inner-joins that league's members.
export async function getMatchReactionTotals(
  db: AppDatabase,
  matchId: string,
  opts?: { leagueId?: string },
): Promise<ReactionTotals> {
  let query = db
    .select({ emoji: matchReaction.emoji, count: sql<number>`count(*)`.mapWith(Number) })
    .from(matchReaction)
    .$dynamic()
  if (opts?.leagueId) {
    query = query.innerJoin(
      leagueMember,
      and(eq(leagueMember.userId, matchReaction.userId), eq(leagueMember.leagueId, opts.leagueId)),
    )
  }
  const rows = await query.where(eq(matchReaction.matchId, matchId)).groupBy(matchReaction.emoji)
  const totals = emptyReactionTotals()
  for (const r of rows) totals[r.emoji] = r.count
  return totals
}

// The caller's own reaction on a match (null if they haven't reacted).
export async function getMyReaction(db: AppDatabase, userId: string, matchId: string): Promise<ReactionEmoji | null> {
  const rows = await db
    .select({ emoji: matchReaction.emoji })
    .from(matchReaction)
    .where(and(eq(matchReaction.userId, userId), eq(matchReaction.matchId, matchId)))
    .limit(1)
  return rows[0]?.emoji ?? null
}
