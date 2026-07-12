import { z } from 'zod'
import { db } from '../../../db'
import { dismissLeaguePrompt } from '../../utils/leagues/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ response: responseSchema }, async ({ user }) => {
  await dismissLeaguePrompt(db, user.id)
  return { ok: true as const }
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
