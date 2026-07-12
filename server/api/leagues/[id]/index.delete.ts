import { z } from 'zod'
import { db } from '../../../../db'
import { isAdmin } from '../../../utils/auth-guards'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { deleteLeague, resolveLeagueManage } from '../../../utils/leagues/service'

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  await resolveLeagueManage(db, id, user.id, { requiredRole: 'OWNER', resolveAdmin: () => isAdmin(event) })
  await deleteLeague(db, id)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Delete a league",
    "description": "Owner or site admin. Memberships, opt-outs and SSO auto-join links are removed with it.",
    "responses": {
      "200": { "description": "Deleted." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not the owner." },
      "404": { "description": "Unknown league." }
    }
  },
})
