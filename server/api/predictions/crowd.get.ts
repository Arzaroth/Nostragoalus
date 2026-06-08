import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { getCrowdTotals } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  if (!competition) return { totals: {} }
  return { totals: await getCrowdTotals(db, competition.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Predictions"],
    "summary": "Crowd totals",
    "description": "The combined total of every player's prediction per match (1-1 + 2-1 + 4-0 shows as 7-2), with the number of predictions. Shown under prediction inputs when the account preference is enabled.",
    "parameters": [
      { "in": "query", "name": "competition", "required": false, "description": "Competition slug.", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "Map of matchId to {home, away, count}." },
      "401": { "description": "Not signed in." }
    }
  },
})
