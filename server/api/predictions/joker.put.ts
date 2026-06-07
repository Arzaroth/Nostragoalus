import { db } from '../../../db'
import { setJoker } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  try {
    await setJoker(db, { userId: user.id, matchId: String(body?.matchId), isJoker: Boolean(body?.isJoker) })
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Predictions"
    ],
    "summary": "Move the joker",
    "description": "Set the x2 joker on a match. One per round; movable while neither the old nor the new match has kicked off.",
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
              }
            },
            "required": [
              "matchId"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Updated joker placement."
      },
      "401": {
        "description": "Not signed in."
      },
      "409": {
        "description": "A concerned match already started."
      }
    }
  },
})
