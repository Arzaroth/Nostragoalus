import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { finalizeMatches } from '../../utils/sync/finalize'
import { listActiveCompetitions } from '../../utils/competitions/store'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { syncMatchDetails } from '../../utils/sync/details'
import { awardBestScorerBonuses } from '../../utils/bestscorer/service'
import { getActiveScoringConfig } from '../../utils/scoring/store'
import { updateLeagueRankSnapshots, updateRankSnapshots } from '../../utils/leaderboard/snapshots'

export default defineTask({
  meta: { name: 'matches:finalize', description: 'Lock due predictions, score finished matches, fetch match details' },
  async run() {
    return recordTaskRun(db, 'matches:finalize', async () => {
    const result = await finalizeMatches(db)

    const details: Record<string, unknown> = {}
    const { rules } = await getActiveScoringConfig(db)
    for (const competition of await listActiveCompetitions(db)) {
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
        // Best-effort: refresh rank snapshots so the leaderboard can show movement arrows.
        await updateRankSnapshots(db, competition.id)
        await updateLeagueRankSnapshots(db, competition.id)
      } catch {
        // never fail the task over snapshots
      }
    }

    return { result: { ...result, details } }
    })
  },
})
