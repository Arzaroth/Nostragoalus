import { db } from '../../../db'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetition } from '../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../utils/sync/competition'

const cache = new Map<string, { at: number; scorers: unknown[] }>()
const TTL_MS = 10 * 60 * 1000

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { scorers: [] }

  const cached = cache.get(competition.id)
  if (cached && Date.now() - cached.at < TTL_MS) return { scorers: cached.scorers }

  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  if (!provider.getTopScorers) return { scorers: [] }

  try {
    const scorers = await provider.getTopScorers({ season: competition.seasonHint ?? '' })
    cache.set(competition.id, { at: Date.now(), scorers })
    return { scorers }
  } catch {
    // Missing token / upstream error → empty, never break the page.
    return { scorers: [] }
  }
})
