import { db } from '../../../../../db'
import { deleteLeague } from '../../../../utils/leagues/service'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { okSchema } from '../../../../schemas/chat'

export default defineValidatedHandler({ admin: true, response: okSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id')!
  await deleteLeague(db, id)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Delete a league",
    "description": "Internal: memberships, opt-outs and SSO auto-join links cascade.",
    "responses": {
      "200": { "description": "Deleted." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown league." }
    }
  },
})
