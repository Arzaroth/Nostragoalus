import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { finalizeMatches } from '../../utils/sync/finalize'
import { listActiveCompetitions } from '../../utils/competitions/store'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { syncMatchDetails } from '../../utils/sync/details'
import { awardBestScorerBonuses } from '../../utils/bestscorer/service'
import { awardCompetitionTrophies } from '../../utils/awards/service'
import { evaluateAchievements } from '../../utils/achievements/service'
import { notifyAchievementUnlocked, notifyTrophyAwarded } from '../../utils/notifications/events'
import { getScoringConfigFor } from '../../utils/scoring/store'
import { updateLeagueRankSnapshots, updateRankSnapshots } from '../../utils/leaderboard/snapshots'
import { publishMatchUpdates } from '../../utils/live/hub'

export default defineTask({
  meta: { name: 'matches:finalize', description: 'Lock due predictions, score finished matches, fetch match details' },
  async run() {
    return recordTaskRun(db, 'matches:finalize', async () => {
    const result = await finalizeMatches(db)

    const details: Record<string, unknown> = {}
    for (const competition of await listActiveCompetitions(db)) {
      // Per-competition config so an override's best-scorer bonus is honoured.
      const { rules } = await getScoringConfigFor(db, competition.id)
      try {
        const seasonId = await resolveCompetitionSeason(db, competition)
        const provider = providerForCompetition(competition, seasonId)
        details[competition.slug] = await syncMatchDetails(db, competition.id, provider)
      } catch {
        // Skip competitions whose provider can't fetch details (e.g. missing token).
      }
      try {
        // After the detail sync (fresh goal_event) and before snapshots, so the
        // Golden Boot bonus reflects the final's goals and the rank movement
        // includes it. Self-gated on a decided final and idempotent.
        await awardBestScorerBonuses(db, competition.id, rules.bestScorerBonus)
      } catch {
        // never fail the task over the best-scorer award
      }
      try {
        // After the best-scorer bonus so the OVERALL trophy reflects the final
        // leaderboard (which folds in that bonus). Self-gated on a decided final
        // and idempotent; only newly-awarded trophies notify.
        const newTrophies = await awardCompetitionTrophies(db, competition.id)
        await notifyTrophyAwarded(db, competition.id, newTrophies)
      } catch {
        // never fail the task over trophies
      }
      try {
        // Only re-baseline rank snapshots when scoring actually changed this
        // tick. Refreshing every tick turned pure roster churn (a user joins,
        // goes private, or is removed between matches) into phantom movement
        // arrows - on day 1, with no match scored, the whole board is tied and
        // any roster change shifted everyone. Movement now reflects scoring.
        if (result.scored > 0) {
          await updateRankSnapshots(db, competition.id)
          await updateLeagueRankSnapshots(db, competition.id)
        }
      } catch {
        // never fail the task over snapshots
      }
      try {
        // Milestone badges only move when scoring does. Runs after the trophy
        // award so treble/podium see this tick's trophies. Idempotent; only
        // newly-earned (or graded-up) badges notify.
        if (result.scored > 0) {
          const newBadges = await evaluateAchievements(db, competition.id)
          await notifyAchievementUnlocked(db, newBadges)
        }
      } catch {
        // never fail the task over achievements
      }
    }

    // Finalize is what sets the points (and the champion/best-scorer bonuses
    // above); tell connected clients so the fixtures points and the leaderboard
    // refresh without a reload. scores:poll only broadcast the FINISHED status,
    // before this scoring ran.
    await publishMatchUpdates(db, result.changedMatchIds)

    return { result: { ...result, details } }
    })
  },
})
