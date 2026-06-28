import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction } from '../../../db/schema'
import type { MatchTransition } from '../sync/upsert-matches'
import { goalPushContent, kickoffPushContent } from './content'
import { pushConfigured, pushToUser } from './send'

// Live statuses where a score increase counts as a goal worth pushing.
const LIVE_STATUSES = new Set(['LIVE', 'PAUSED'])

// Push-only live alerts off the score poll, scoped to the match's predictors:
// MATCH_LIVE on a SCHEDULED -> LIVE transition (the kickoff), and GOAL whenever
// the live scoreline rises past the level we last announced. Both ride the
// upsert transition, so each fires once. A goal alert is non-revocable on the
// device, so the dedup compares against a persisted per-side high-water rather
// than the previous poll's score: a VAR disallow that dips the score and then
// returns to an already-announced level never re-pushes. No-op unless push is
// configured.
export async function notifyLiveMatchEvents(
  db: AppDatabase,
  competitionSlug: string,
  transitions: MatchTransition[],
): Promise<void> {
  if (!pushConfigured() || transitions.length === 0) return
  for (const t of transitions) {
    const isKickoff = t.prevStatus === 'SCHEDULED' && t.status === 'LIVE'
    const curHome = t.home ?? 0
    const curAway = t.away ?? 0
    const pushedHome = t.lastGoalPushHome ?? 0
    const pushedAway = t.lastGoalPushAway ?? 0
    const isGoal = LIVE_STATUSES.has(t.status) && (curHome > pushedHome || curAway > pushedAway)
    if (!isKickoff && !isGoal) continue

    // Advance the high-water before sending: the announcement attempt is made
    // once, matching the existing best-effort (no per-goal retry) push model, so
    // a later score oscillation can't re-fire it.
    if (isGoal) {
      await db
        .update(match)
        .set({ lastGoalPushHome: Math.max(pushedHome, curHome), lastGoalPushAway: Math.max(pushedAway, curAway) })
        .where(eq(match.id, t.matchId))
    }

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
