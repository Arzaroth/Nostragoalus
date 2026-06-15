import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { prediction } from '../../../db/schema'
import type { MatchTransition } from '../sync/upsert-matches'
import { goalPushContent, kickoffPushContent } from './content'
import { pushConfigured, pushToUser } from './send'

// Live statuses where a score increase counts as a goal worth pushing.
const LIVE_STATUSES = new Set(['LIVE', 'PAUSED'])

// Push-only live alerts off the score poll, scoped to the match's predictors:
// MATCH_LIVE on a SCHEDULED -> LIVE transition (the kickoff), and GOAL whenever
// the live scoreline goes up. Both ride the upsert transition, so each fires
// once: the next poll has no delta. No-op unless push is configured.
export async function notifyLiveMatchEvents(
  db: AppDatabase,
  competitionSlug: string,
  transitions: MatchTransition[],
): Promise<void> {
  if (!pushConfigured() || transitions.length === 0) return
  for (const t of transitions) {
    const isKickoff = t.prevStatus === 'SCHEDULED' && t.status === 'LIVE'
    const isGoal = LIVE_STATUSES.has(t.status) && (t.home ?? 0) + (t.away ?? 0) > (t.prevHome ?? 0) + (t.prevAway ?? 0)
    if (!isKickoff && !isGoal) continue

    const predictors = await db
      .select({ userId: prediction.userId })
      .from(prediction)
      .where(eq(prediction.matchId, t.matchId))
    if (predictors.length === 0) continue

    for (const { userId } of predictors) {
      if (isKickoff) {
        await pushToUser(db, userId, 'kickoff', (locale) => kickoffPushContent(competitionSlug, t, locale))
      }
      if (isGoal) {
        await pushToUser(db, userId, 'goals', (locale) => goalPushContent(competitionSlug, t, locale))
      }
    }
  }
}
