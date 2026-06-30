import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { getCompetitionBySlug } from '../../utils/competitions/store'
import { getLeagueCompleteness } from '../../utils/predictions/service'

// Per-league completeness of the caller's picks for a competition (the nudge):
// which leagues have every open match covered, and which still need a real score
// (NORMAL) or a stake (HARD).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = getQuery(event).competition
  if (typeof slug !== 'string' || !slug) throw createError({ statusCode: 400, statusMessage: 'competition required' })
  const competition = await getCompetitionBySlug(db, slug)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'Unknown competition' })
  const leagues = await getLeagueCompleteness(db, user.id, competition.id)
  return { leagues }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "My pick completeness per league",
    "parameters": [{ "name": "competition", "in": "query", "required": true, "schema": { "type": "string" } }],
    "responses": {
      "200": { "description": "Per-league completeness summaries." },
      "400": { "description": "Missing competition." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown competition." }
    }
  },
})
