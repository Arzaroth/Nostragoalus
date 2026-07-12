import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatMessage, dmThread } from '../../../db/schema'
import { ForbiddenError, NotFoundError } from '../errors'
import { getMembership } from '../leagues/service'
import { getLeagueMemberIds } from './service'

// A chat_message belongs to exactly one scope (the chat_message_scope_xor CHECK):
// a league room (with an optional match thread) or a direct-message thread. Every
// action on a message - react, edit, fetch an attachment, list media - authorizes
// the actor and pushes the result to the right audience through this one place, so
// DM and league messages run the same code past the scope resolution.
export type MessageContext =
  | { kind: 'league'; leagueId: string; matchId: string | null; role: string }
  | { kind: 'dm'; threadId: string; userAId: string; userBId: string }

// Resolve a message's scope AND authorize the actor on it, or throw. League: the
// actor must be a member (their role rides along for admin-gated actions). DM: the
// actor must be one of the two participants (a non-participant gets NotFound so the
// thread's existence never leaks). Returns the context the callers branch on.
export async function authorizeMessageActor(db: AppDatabase, messageId: string, userId: string): Promise<MessageContext> {
  const rows = await db
    .select({ leagueId: chatMessage.leagueId, matchId: chatMessage.matchId, dmThreadId: chatMessage.dmThreadId })
    .from(chatMessage)
    .where(eq(chatMessage.id, messageId))
    .limit(1)
  const m = rows[0]
  if (!m) throw new NotFoundError('message not found')
  if (m.dmThreadId) {
    const t = await db
      .select({ userAId: dmThread.userAId, userBId: dmThread.userBId })
      .from(dmThread)
      .where(eq(dmThread.id, m.dmThreadId))
      .limit(1)
    if (!t[0] || (t[0].userAId !== userId && t[0].userBId !== userId)) throw new NotFoundError('message not found')
    return { kind: 'dm', threadId: m.dmThreadId, userAId: t[0].userAId, userBId: t[0].userBId }
  }
  // Non-DM rows always have a leagueId (the scope CHECK).
  const membership = await getMembership(db, m.leagueId as string, userId)
  if (!membership) throw new ForbiddenError('not a league member')
  return { kind: 'league', leagueId: m.leagueId as string, matchId: m.matchId, role: membership.role }
}

// The user ids a change to this message is pushed to: the league's members, or the
// DM thread's two participants.
export async function messageAudience(db: AppDatabase, ctx: MessageContext): Promise<string[]> {
  return ctx.kind === 'dm' ? [ctx.userAId, ctx.userBId] : getLeagueMemberIds(db, ctx.leagueId)
}

// Whether the actor can moderate in this scope. DMs have no moderator (a symmetric
// two-person room), so moderation is league-only.
export function isModerator(ctx: MessageContext): boolean {
  return ctx.kind === 'league' && (ctx.role === 'OWNER' || ctx.role === 'MODERATOR')
}
