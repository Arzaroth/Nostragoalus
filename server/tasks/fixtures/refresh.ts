import { db } from '../../../db'
import { getProvider } from '../../utils/providers'
import { ensureRounds } from '../../utils/sync/rounds'
import { ensureDefaultScoringConfig } from '../../utils/scoring/store'
import { upsertMatches } from '../../utils/sync/upsert-matches'

export default defineTask({
  meta: { name: 'fixtures:refresh', description: 'Refresh World Cup fixtures from the provider' },
  async run() {
    await ensureRounds(db)
    await ensureDefaultScoringConfig(db)
    const season = useRuntimeConfig().wcSeason
    const fixtures = await getProvider().listFixtures({ season })
    return { result: await upsertMatches(db, fixtures) }
  },
})
