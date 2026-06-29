import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, league, match } from '../../../db/schema'
import { createNotification } from '../notifications/service'
import { displayName } from '../notifications/events'
import { getLeagueMemberIds } from './service'

// Notify everyone the sender @-mentioned in a chat message: a header-bell entry
// plus a web push, cross-league (createNotification does both). `mentions` is
// unvalidated client input, so it is intersected with the league's real members
// and the sender is dropped - that stops cross-league and self spam. It cannot
// stop a co-member fabricating a mention of someone the visible text never named:
// the body is E2EE, so the server can't check the sidecar against it (the
// recipient's own `pushMentions` toggle is the backstop). See TODO.md.
// The notification carries room context only (sender name + league/match), never
// text. dedupeKey makes re-delivery idempotent. Best-effort: fire and forget.
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

  // The recipients are members, so their league (and its competition) exists; the
  // three lookups are independent, so one round trip. senderName goes through the
  // shared resolver (display name -> account name -> 'Someone'), matching the
  // other notification builders. mrow is undefined for a league-global mention.
  const [lrow, senderName, mrow] = await Promise.all([
    db
      .select({ leagueName: league.name, competitionSlug: competition.slug })
      .from(league)
      .innerJoin(competition, eq(competition.id, league.competitionId))
      .where(eq(league.id, opts.leagueId))
      .limit(1)
      .then((r) => r[0] as { leagueName: string; competitionSlug: string }),
    displayName(db, opts.senderId),
    opts.matchId
      ? db
          .select({ homeTeam: match.homeTeam, awayTeam: match.awayTeam })
          .from(match)
          .where(eq(match.id, opts.matchId))
          .limit(1)
          .then((r) => r[0])
      : Promise.resolve(undefined),
  ])

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
        homeTeam: mrow?.homeTeam ?? null,
        awayTeam: mrow?.awayTeam ?? null,
        senderId: opts.senderId,
        senderName,
      },
      dedupeKey: `mention:${opts.messageId}:${userId}`,
    })
    if (created) sent += 1
  }
  return sent
}
