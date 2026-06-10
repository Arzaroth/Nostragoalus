import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { shouldShowLeaguePrompt } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { show: await shouldShowLeaguePrompt(db, user.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Should the one-time league prompt show",
    "description": "True only while the user has never dismissed it and belongs to no league.",
    "responses": {
      "200": { "description": "{ show: boolean }" },
      "401": { "description": "Not signed in." }
    }
  },
})
