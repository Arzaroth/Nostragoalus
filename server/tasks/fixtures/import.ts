import { db } from '../../../db'
import { recordTaskRun } from '../../utils/tasks/recorder'
import { providerForCompetition } from '../../utils/providers'
import {
  ensureDefaultCompetition,
  getCompetitionBySlug,
  listActiveCompetitions,
} from '../../utils/competitions/store'
import { resolveCompetitionSeason, syncFixtures } from '../../utils/sync/competition'
import { ensureRounds } from '../../utils/sync/rounds'
import { upsertMatches } from '../../utils/sync/upsert-matches'
import { ensureDefaultScoringConfig } from '../../utils/scoring/store'
import { DEMO_FIXTURES } from '../../utils/sync/demo-fixtures'

// Manual-only (admin Background tasks page): one-shot import of every active
// competition's fixtures from its provider, or the bundled demo set when the
// payload asks. Same logic the old /api/admin/import-fixtures route held.
export default defineTask({
  meta: { name: 'fixtures:import', description: 'Import fixtures for every competition from their providers' },
  async run({ payload }) {
    const source = (payload as { source?: string } | undefined)?.source
    return recordTaskRun(db, 'fixtures:import', async () => {
      await ensureDefaultScoringConfig(db)
      await ensureDefaultCompetition(db)

      if (source === 'demo') {
        const competition = await getCompetitionBySlug(db, 'world-cup-2026')
        if (!competition) throw new Error('default competition missing')
        await ensureRounds(db, competition.id, DEMO_FIXTURES)
        return await upsertMatches(db, competition.id, DEMO_FIXTURES)
      }

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
      return result
    })
  },
})
