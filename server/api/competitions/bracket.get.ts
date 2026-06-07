import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { match } from '../../../db/schema'
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
    if (bracket) {
      // Link each bracket match to our internal match id (for navigation).
      const ours = await db
        .select({ id: match.id, pid: match.providerMatchId })
        .from(match)
        .where(eq(match.competitionId, competition.id))
      const idByProvider = new Map(ours.map((m) => [m.pid, m.id]))
      for (const round of bracket.rounds) {
        for (const m of round.matches) m.id = idByProvider.get(m.providerMatchId) ?? null
      }
    }
    cache.set(competition.id, { at: Date.now(), bracket })
    return { bracket }
  } catch {
    return { bracket: null }
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "Knockout bracket",
    "description": "The knockout tree (rounds, feeders ordered under their parents) plus the champion once decided. Null while no knockout structure exists.",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Bracket rounds and winner, or null."
      }
    }
  },
})
