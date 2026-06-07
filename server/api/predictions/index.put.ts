import { db } from '../../../db'
import { upsertPrediction } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  try {
    const id = await upsertPrediction(db, {
      userId: user.id,
      matchId: String(body?.matchId),
      home: Number(body?.home),
      away: Number(body?.away),
    })
    return { id }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Predictions"
    ],
    "summary": "Save a prediction",
    "description": "Create or update the score prediction for one match. Rejected once the match has kicked off (server-side lock) or while the teams are unconfirmed.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "matchId": {
                "type": "string",
                "format": "uuid"
              },
              "homeGoals": {
                "type": "integer",
                "minimum": 0
              },
              "awayGoals": {
                "type": "integer",
                "minimum": 0
              }
            },
            "required": [
              "matchId",
              "homeGoals",
              "awayGoals"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "The stored prediction."
      },
      "401": {
        "description": "Not signed in."
      },
      "409": {
        "description": "Match already kicked off."
      },
      "422": {
        "description": "Invalid scores or unconfirmed teams."
      }
    }
  },
})
