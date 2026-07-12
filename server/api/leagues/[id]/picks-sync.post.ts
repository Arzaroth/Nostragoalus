import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { setLeaguePicksSynced } from '../../../utils/predictions/service'

const bodySchema = z.object({ synced: z.boolean() })

const responseSchema = z.object({ ok: z.literal(true) })

// Toggle whether a league mirrors the member's base picks. Re-syncing drops the
// member's overrides on matches that have not kicked off.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ event, body, user }) => {
  const leagueId = getRouterParam(event, 'id')!
  await setLeaguePicksSynced(db, { leagueId, userId: user.id, synced: body.synced })
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Follow main picks or keep league-specific ones",
    "description": "synced=true makes the league mirror your base picks and drops your future overrides; synced=false lets you keep per-league overrides.",
    "responses": {
      "200": { "description": "Updated." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not a league member." },
      "422": { "description": "Invalid body." }
    }
  },
})
