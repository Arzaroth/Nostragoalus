import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, league, match, user } from '../../../db/schema'
import { createNotification } from '../notifications/service'
import { getLeagueMemberIds } from './service'

// Notify everyone the sender @-mentioned in a chat message: a header-bell entry
// plus a web push, cross-league (createNotification does both). `mentions` is
// unvalidated client input, so it is intersected with the league's real members
// and the sender is dropped - otherwise a crafted client could push-spam anyone.
// The message body is E2EE, so the notification carries room context only (sender
// name + league/match), never text. dedupeKey makes re-delivery idempotent.
// Best-effort: the caller fires and forgets.
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

  const lrows = await db
    .select({ leagueName: league.name, competitionSlug: competition.slug })
    .from(league)
    .innerJoin(competition, eq(competition.id, league.competitionId))
    .where(eq(league.id, opts.leagueId))
    .limit(1)
  const lrow = lrows[0]
  if (!lrow) return 0

  const srows = await db.select({ name: user.name }).from(user).where(eq(user.id, opts.senderId)).limit(1)
  const senderName = srows[0] ? srows[0].name : ''

  let homeTeam: string | null = null
  let awayTeam: string | null = null
  if (opts.matchId) {
    const mrows = await db
      .select({ homeTeam: match.homeTeam, awayTeam: match.awayTeam })
      .from(match)
      .where(eq(match.id, opts.matchId))
      .limit(1)
    const m = mrows[0]
    if (m) {
      homeTeam = m.homeTeam
      awayTeam = m.awayTeam
    }
  }

  let sent = 0
  for (const userId of recipients) {
    const created = await createNotification(db, {
      userId,
      data: {
        type: 'CHAT_MENTION',
        leagueId: opts.leagueId,
        leagueName: lrow.leagueName,
        competitionSlug: lrow.competitionSlug,
        matchId: opts.matchId,
        homeTeam,
        awayTeam,
        senderId: opts.senderId,
        senderName,
      },
      dedupeKey: `mention:${opts.messageId}:${userId}`,
    })
    if (created) sent += 1
  }
  return sent
}
