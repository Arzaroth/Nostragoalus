import type { AppDatabase } from '../../../db/types'
import { listCompetitions } from '../competitions/store'
import { evaluateAchievements } from './service'

// Milestone badges are granted lazily by the matches:finalize task, and only on a
// tick that newly scores a match (result.scored > 0). Deploying the achievements
// feature over a competition whose matches are already scored - or a finished one
// that will never finalize again - therefore leaves every historically-earned
// badge ungranted until (if ever) another match scores. This one-shot backfill
// runs the same idempotent evaluation across every competition so existing
// players get the badges they already earned.
//
// It grants SILENTLY: evaluateAchievements only writes the rows and returns the
// newly-unlocked list; we discard it instead of calling notifyAchievementUnlocked,
// so a deploy backfill doesn't blast users with a backlog of historical unlocks.
// Going forward, finalize keeps notifying for genuinely new unlocks. Re-running is
// safe (the evaluation is idempotent and a high-water mark).
export interface AchievementsBackfillSummary {
  competitions: number
  badgesGranted: number
  perCompetition: { competitionId: string; slug: string; granted: number }[]
}

export async function backfillAchievements(db: AppDatabase): Promise<AchievementsBackfillSummary> {
  const competitions = await listCompetitions(db)
  const perCompetition: AchievementsBackfillSummary['perCompetition'] = []
  let badgesGranted = 0
  for (const c of competitions) {
    const newly = await evaluateAchievements(db, c.id)
    badgesGranted += newly.length
    perCompetition.push({ competitionId: c.id, slug: c.slug, granted: newly.length })
  }
  return { competitions: competitions.length, badgesGranted, perCompetition }
}
