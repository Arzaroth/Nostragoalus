import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, league, match, user } from '../../../db/schema'
import { createNotification } from '../notifications/service'
import { getLeagueMemberIds } from './service'

interface MentionContext {
  leagueName: string
  competitionSlug: string
  senderName: string
  homeTeam: string | null
  awayTeam: string | null
}

// League name + competition slug (for the deep link), the sender's display name,
// and the match teams when the mention is in a match thread. One round trip per
// piece; null when the league is gone (the message's league was deleted mid-send).
async function mentionContext(
  db: AppDatabase,
  leagueId: string,
  matchId: string | null,
  senderId: string,
): Promise<MentionContext | null> {
  const lrows = await db
    .select({ leagueName: league.name, competitionSlug: competition.slug })
    .from(league)
    .innerJoin(competition, eq(competition.id, league.competitionId))
    .where(eq(league.id, leagueId))
    .limit(1)
  if (!lrows[0]) return null

  const srows = await db.select({ name: user.name }).from(user).where(eq(user.id, senderId)).limit(1)

  let homeTeam: string | null = null
  let awayTeam: string | null = null
  if (matchId) {
    const mrows = await db
      .select({ homeTeam: match.homeTeam, awayTeam: match.awayTeam })
      .from(match)
      .where(eq(match.id, matchId))
      .limit(1)
    homeTeam = mrows[0]?.homeTeam ?? null
    awayTeam = mrows[0]?.awayTeam ?? null
  }

  return {
    leagueName: lrows[0].leagueName,
    competitionSlug: lrows[0].competitionSlug,
    senderName: srows[0]?.name ?? '',
    homeTeam,
    awayTeam,
  }
}

// Notify everyone the sender @-mentioned in a chat message: a header-bell entry
// plus a web push, cross-league (createNotification does both). `mentions` is
// unvalidated client input, so it is intersected with the league's real members
// and the sender is dropped - otherwise a crafted client could push-spam anyone.
// dedupeKey makes re-delivery idempotent. Best-effort: the caller fires and forgets.
export async function notifyMentions(
  db: AppDatabase,
  opts: {
    leagueId: string
    matchId: string | null
    messageId: string
    senderId: string
    mentions: readonly string[]
  },
): Promise<number> {
  if (opts.mentions.length === 0) return 0
  const members = new Set(await getLeagueMemberIds(db, opts.leagueId))
  const recipients = [...new Set(opts.mentions)].filter((id) => id !== opts.senderId && members.has(id))
  if (recipients.length === 0) return 0

  const ctx = await mentionContext(db, opts.leagueId, opts.matchId, opts.senderId)
  if (!ctx) return 0

  let sent = 0
  for (const userId of recipients) {
    const created = await createNotification(db, {
      userId,
      data: {
        type: 'CHAT_MENTION',
        leagueId: opts.leagueId,
        leagueName: ctx.leagueName,
        competitionSlug: ctx.competitionSlug,
        matchId: opts.matchId,
        homeTeam: ctx.homeTeam,
        awayTeam: ctx.awayTeam,
        senderId: opts.senderId,
        senderName: ctx.senderName,
      },
      dedupeKey: `mention:${opts.messageId}:${userId}`,
    })
    if (created) sent += 1
  }
  return sent
}
