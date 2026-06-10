import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { setProviderAutoJoinLeagues } from '../../../../utils/leagues/service'

const bodySchema = z.object({ leagueIds: z.array(z.string()).max(100) })

// Separate from the provider PUT: that endpoint round-trips through
// better-auth's register/update flow and the encrypted config; league links
// are plain app data.
export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ event, body }) => {
  const providerId = getRouterParam(event, 'providerId')!
  await setProviderAutoJoinLeagues(db, providerId, body.leagueIds)
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Set a provider's auto-join leagues",
    "description": "Internal: replace-set. Users signing in through this provider are added to these leagues unless they previously left.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": { "leagueIds": { "type": "array", "items": { "type": "string" } } },
            "required": ["leagueIds"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Links replaced." },
      "400": { "description": "Unknown league id." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown provider." },
      "422": { "description": "Invalid body." }
    }
  },
})
