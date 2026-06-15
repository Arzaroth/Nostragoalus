import { and, eq, gt, isNotNull, lte, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, match, prediction, userNotification } from '../../../db/schema'
import { createNotification } from './service'

// How long before kickoff a missing-pick reminder fires. The pick locks at
// kickoff, so this is the last-chance nudge window.
export const REMINDER_LEAD_MS = 3 * 60 * 60 * 1000

// Emit a PICK_REMINDER to every active predictor of a competition who has not
// predicted a match that kicks off within the lead window. "Active predictor" =
// has made at least one prediction in that competition, so dormant/never-played
// accounts are never nagged. dedupeKey is per match, so repeated task runs only
// remind each user once; createNotification returns null on the dedupe.
export async function remindMissingPredictions(
  db: AppDatabase,
  now: Date = new Date(),
  leadMs: number = REMINDER_LEAD_MS,
): Promise<number> {
  const windowEnd = new Date(now.getTime() + leadMs)
  const matches = await db
    .select({
      id: match.id,
      competitionId: match.competitionId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
      slug: competition.slug,
    })
    .from(match)
    .innerJoin(competition, eq(competition.id, match.competitionId))
    .where(
      and(
        eq(match.status, 'SCHEDULED'),
        isNotNull(match.homeTeamCode),
        isNotNull(match.awayTeamCode),
        gt(match.kickoffTime, now),
        lte(match.kickoffTime, windowEnd),
      ),
    )
  if (matches.length === 0) return 0

  // Active predictors are per competition, not per match: resolve once.
  const activeByCompetition = new Map<string, string[]>()
  async function activePredictors(competitionId: string): Promise<string[]> {
    const cached = activeByCompetition.get(competitionId)
    if (cached) return cached
    const rows = await db
      .selectDistinct({ userId: prediction.userId })
      .from(prediction)
      .innerJoin(match, eq(match.id, prediction.matchId))
      .where(eq(match.competitionId, competitionId))
    const ids = rows.map((r) => r.userId)
    activeByCompetition.set(competitionId, ids)
    return ids
  }

  let emitted = 0
  for (const m of matches) {
    const active = await activePredictors(m.competitionId)
    if (active.length === 0) continue
    const predictedRows = await db
      .select({ userId: prediction.userId })
      .from(prediction)
      .where(eq(prediction.matchId, m.id))
    const predicted = new Set(predictedRows.map((r) => r.userId))
    for (const userId of active) {
      if (predicted.has(userId)) continue
      const dto = await createNotification(db, {
        userId,
        dedupeKey: `pick-reminder:${m.id}`,
        data: {
          type: 'PICK_REMINDER',
          matchId: m.id,
          competitionSlug: m.slug,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          kickoffTime: m.kickoffTime.toISOString(),
        },
      })
      if (dto) emitted += 1
    }
  }
  return emitted
}

// Once a match kicks off the pick window is closed, so any reminder for it is
// stale (it can no longer be acted on) - drop it, read or not. Driven by the
// few PICK_REMINDER rows, not by scanning every past match.
export async function pruneStartedReminders(db: AppDatabase, now: Date = new Date()): Promise<number> {
  const deleted = await db
    .delete(userNotification)
    .where(
      and(
        eq(userNotification.type, 'PICK_REMINDER'),
        sql`exists (select 1 from ${match} where ${match.id} = ${userNotification.data} ->> 'matchId' and ${match.kickoffTime} <= ${now})`,
      ),
    )
    .returning({ id: userNotification.id })
  return deleted.length
}

// Fulfil the reminder the instant a user predicts the match: drop their
// PICK_REMINDER for it so the bell never shows a stale "you haven't predicted".
export async function deletePickReminder(db: AppDatabase, userId: string, matchId: string): Promise<void> {
  await db
    .delete(userNotification)
    .where(
      and(
        eq(userNotification.userId, userId),
        eq(userNotification.type, 'PICK_REMINDER'),
        sql`${userNotification.data} ->> 'matchId' = ${matchId}`,
      ),
    )
}
