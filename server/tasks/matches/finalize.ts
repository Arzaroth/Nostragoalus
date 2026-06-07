import { db } from '../../../db'
import { finalizeMatches } from '../../utils/sync/finalize'
import { listActiveCompetitions } from '../../utils/competitions/store'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { syncMatchDetails } from '../../utils/sync/details'
import { updateRankSnapshots } from '../../utils/leaderboard/snapshots'

export default defineTask({
  meta: { name: 'matches:finalize', description: 'Lock due predictions, score finished matches, fetch match details' },
  async run() {
    const result = await finalizeMatches(db)

    const details: Record<string, unknown> = {}
    for (const competition of await listActiveCompetitions(db)) {
      try {
        const seasonId = await resolveCompetitionSeason(db, competition)
        const provider = providerForCompetition(competition, seasonId)
        details[competition.slug] = await syncMatchDetails(db, competition.id, provider)
      } catch {
        // Skip competitions whose provider can't fetch details (e.g. missing token).
      }
      try {
        // Best-effort: refresh rank snapshots so the leaderboard can show movement arrows.
        await updateRankSnapshots(db, competition.id)
      } catch {
        // never fail the task over snapshots
      }
    }

    return { result: { ...result, details } }
  },
})
