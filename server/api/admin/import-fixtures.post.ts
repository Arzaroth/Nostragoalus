import { db } from '../../../db'
import { requireAdmin } from '../../utils/auth-guards'
import { getProvider } from '../../utils/providers'
import { ensureRounds } from '../../utils/sync/rounds'
import { ensureDefaultScoringConfig } from '../../utils/scoring/store'
import { upsertMatches } from '../../utils/sync/upsert-matches'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  await ensureRounds(db)
  await ensureDefaultScoringConfig(db)

  const season = useRuntimeConfig().wcSeason
  const fixtures = await getProvider().listFixtures({ season })
  return await upsertMatches(db, fixtures)
})
