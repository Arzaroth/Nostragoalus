import { db } from '../../../db'
import { getMyPredictions } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  return { predictions: await getMyPredictions(db, user.id, competition?.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Predictions"
    ],
    "summary": "My predictions",
    "description": "All of the signed-in user's predictions for a competition, with per-match points once scored.",
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
        "description": "Prediction list."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
