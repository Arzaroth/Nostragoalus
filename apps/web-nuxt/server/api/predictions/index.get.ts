import { z } from 'zod'
import { db } from '../../../db'
import { predictionViewSchema } from '../../schemas/prediction'
import { resolveCompetition } from '../../utils/competitions/store'
import { getMyPredictions } from '../../utils/predictions/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })
const responseSchema = z.object({ predictions: z.array(predictionViewSchema) })

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
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
