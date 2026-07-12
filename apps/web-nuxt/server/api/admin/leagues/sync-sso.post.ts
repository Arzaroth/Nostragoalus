import { z } from 'zod'
import { db } from '../../../../db'
import { applyAllProviderAutoJoins } from '../../../utils/leagues/auto-join'
import { defineValidatedHandler } from '../../../utils/validated-handler'

const responseSchema = z.object({
  providers: z.number(),
  usersMatched: z.number(),
  joined: z.number(),
})

export default defineValidatedHandler({ admin: true, response: responseSchema }, async () => {
  return await applyAllProviderAutoJoins(db)
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Apply SSO auto-join to existing users",
    "description": "Internal: back-fills provider league auto-join for every existing user whose email domain a linked provider captures, without waiting for them to log in again. Idempotent; honors opt-outs.",
    "responses": {
      "200": { "description": "{ providers, usersMatched, joined } counts." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." }
    }
  },
})
