import { z } from 'zod'
import { db } from '../../../db'
import { matchOddsViewSchema, matchRowSchema, predictionRowSchema } from '../../schemas/match'
import { getMatchDetail } from '../../utils/matches/service'
import { getSessionUser } from '../../utils/auth-guards'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({
  match: matchRowSchema,
  myPrediction: predictionRowSchema.nullable(),
  odds: matchOddsViewSchema.nullable(),
  isLocked: z.boolean(),
})

export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  // Optional session: a signed-out visitor still sees the match, just without
  // their own prediction. defineReadHandler has no 'maybe-auth' mode, so resolve
  // the session by hand rather than opting into the throw-on-missing guard.
  const user = await getSessionUser(event)
  const detail = await getMatchDetail(db, id, user?.id)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'match not found' })

  return { ...detail, isLocked: new Date(detail.match.kickoffTime).getTime() <= Date.now() }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match detail",
    "description": "One match with standings context and the caller's prediction. isLocked reflects the server clock, not yours.",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "Internal match id (UUID).",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Match, prediction, lock state."
      },
      "404": {
        "description": "Unknown match id."
      }
    }
  },
})
