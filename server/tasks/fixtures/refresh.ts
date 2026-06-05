import { db } from '../../../db'
import { providerForCompetition } from '../../utils/providers'
import { ensureDefaultCompetition, listActiveCompetitions } from '../../utils/competitions/store'
import { resolveCompetitionSeason, syncFixtures } from '../../utils/sync/competition'
import { ensureDefaultScoringConfig } from '../../utils/scoring/store'

export default defineTask({
  meta: { name: 'fixtures:refresh', description: 'Refresh fixtures for all active competitions' },
  async run() {
    await ensureDefaultScoringConfig(db)
    await ensureDefaultCompetition(db)

    const result: Record<string, unknown> = {}
    for (const competition of await listActiveCompetitions(db)) {
      try {
        const seasonId = await resolveCompetitionSeason(db, competition)
        const provider = providerForCompetition(competition, seasonId)
        result[competition.slug] = await syncFixtures(db, competition.id, provider, competition.seasonHint ?? '')
      } catch (error) {
        result[competition.slug] = { error: (error as Error).message }
      }
    }
    return { result }
  },
})
