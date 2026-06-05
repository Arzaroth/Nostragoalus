import { db } from '../../../db'
import { requireAdmin } from '../../utils/auth-guards'
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

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event).catch(() => ({}))

  await ensureDefaultScoringConfig(db)
  await ensureDefaultCompetition(db)

  if (body?.source === 'demo') {
    const competition = await getCompetitionBySlug(db, 'world-cup-2026')
    if (!competition) throw createError({ statusCode: 500, statusMessage: 'default competition missing' })
    await ensureRounds(db, competition.id, DEMO_FIXTURES)
    return await upsertMatches(db, competition.id, DEMO_FIXTURES)
  }

  const result: Record<string, unknown> = {}
  for (const competition of await listActiveCompetitions(db)) {
    const seasonId = await resolveCompetitionSeason(db, competition)
    const provider = providerForCompetition(competition, seasonId)
    result[competition.slug] = await syncFixtures(db, competition.id, provider, competition.seasonHint ?? '')
  }
  return result
})
