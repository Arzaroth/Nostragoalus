import { db } from '../../../db'
import { requireAdmin } from '../../utils/auth-guards'
import { getProvider } from '../../utils/providers'
import { ensureRounds } from '../../utils/sync/rounds'
import { ensureDefaultScoringConfig } from '../../utils/scoring/store'
import { upsertMatches } from '../../utils/sync/upsert-matches'
import { DEMO_FIXTURES } from '../../utils/sync/demo-fixtures'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))

  await ensureRounds(db)
  await ensureDefaultScoringConfig(db)

  if (body?.source === 'demo') {
    return await upsertMatches(db, DEMO_FIXTURES)
  }

  const season = useRuntimeConfig().wcSeason
  const fixtures = await getProvider().listFixtures({ season })
  return await upsertMatches(db, fixtures)
})
