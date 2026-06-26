import { and, asc, eq, gte, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, match, prediction, round } from '../../../db/schema'
import type { FeedMatch } from './ical'

const FEED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Feed scope: forward-looking + recent. Every fixture of an ACTIVE competition
// whose kickoff is within the last 7 days or in the future, so the calendar stays
// relevant - past tournaments drop out of the window on their own, without needing
// a per-user followed-competitions set (not yet a feature).
export async function getFeedMatches(db: AppDatabase, userId: string, now: Date): Promise<FeedMatch[]> {
  const cutoff = new Date(now.getTime() - FEED_WINDOW_MS)
  const rows = await db
    .select({
      id: match.id,
      competitionSlug: competition.slug,
      competitionName: competition.name,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
      status: match.status,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
      penaltiesHome: match.penaltiesHome,
      penaltiesAway: match.penaltiesAway,
      roundLabel: round.label,
    })
    .from(match)
    .innerJoin(round, eq(match.roundId, round.id))
    .innerJoin(competition, eq(match.competitionId, competition.id))
    .where(and(eq(competition.isActive, true), gte(match.kickoffTime, cutoff)))
    .orderBy(asc(match.kickoffTime))

  if (rows.length === 0) return []

  const predicted = await db
    .select({ matchId: prediction.matchId })
    .from(prediction)
    .where(
      and(
        eq(prediction.userId, userId),
        inArray(
          prediction.matchId,
          rows.map((r) => r.id),
        ),
      ),
    )
  const predictedSet = new Set(predicted.map((p) => p.matchId))

  return rows.map((r) => ({ ...r, predicted: predictedSet.has(r.id) }))
}
