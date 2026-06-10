import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { dismissLeaguePrompt } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await dismissLeaguePrompt(db, user.id)
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Dismiss the one-time league prompt",
    "description": "Idempotent; the prompt never shows again on any device.",
    "responses": {
      "200": { "description": "Dismissed." },
      "401": { "description": "Not signed in." }
    }
  },
})
