import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { listPublicLeagues } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  if (!competition) return { competition: null, leagues: [] }
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    leagues: await listPublicLeagues(db, competition.id),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Browse public leagues",
    "description": "Public leagues of a competition; anyone signed in can view their rankings or join with one click.",
    "parameters": [
      { "in": "query", "name": "competition", "required": false, "description": "Competition slug. Defaults to the current tournament.", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "Public leagues with member counts." },
      "401": { "description": "Not signed in." }
    }
  },
})
