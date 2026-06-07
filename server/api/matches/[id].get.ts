import { db } from '../../../db'
import { getMatchDetail } from '../../utils/matches/service'
import { getSessionUser } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
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
