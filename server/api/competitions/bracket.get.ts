import { db } from '../../../db'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetition } from '../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../utils/sync/competition'

const cache = new Map<string, { at: number; bracket: unknown }>()
const TTL_MS = 10 * 60 * 1000

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { bracket: null }

  const cached = cache.get(competition.id)
  if (cached && Date.now() - cached.at < TTL_MS) return { bracket: cached.bracket }

  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  if (!provider.getBracket) return { bracket: null }

  try {
    const bracket = await provider.getBracket()
    cache.set(competition.id, { at: Date.now(), bracket })
    return { bracket }
  } catch {
    return { bracket: null }
  }
})
