import { z } from 'zod'
import { db } from '../../../db'
import { setJoker } from '../../utils/predictions/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  matchId: z.string().uuid(),
  isJoker: z.boolean(),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  await setJoker(db, { userId: user.id, matchId: body.matchId, isJoker: body.isJoker })
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Predictions"],
    "summary": "Move the joker",
    "description": "Set or clear the x2 joker on a match. One per round; movable while neither match has kicked off. Rejected on single-match rounds (final, third place) and unconfirmed-team fixtures.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "matchId": { "type": "string", "format": "uuid" },
              "isJoker": { "type": "boolean" }
            },
            "required": ["matchId", "isJoker"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Updated joker placement." },
      "401": { "description": "Not signed in." },
      "409": { "description": "A concerned match already started." },
      "422": { "description": "Invalid body, single-match round, or unconfirmed teams." }
    }
  },
})
