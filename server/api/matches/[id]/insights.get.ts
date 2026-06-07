import { db } from '../../../../db'
import { getMatchInsights } from '../../../utils/stats/insights'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const insights = await getMatchInsights(db, id)
  if (!insights) throw createError({ statusCode: 404, statusMessage: 'match not found' })
  return insights
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match insights",
    "description": "Pre/post-match intelligence: recent form, next matches, head-to-head, group standings, goals and possession.",
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
        "description": "Insights bundle."
      }
    }
  },
})
