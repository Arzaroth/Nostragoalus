import { db } from '../../../../../db'
import { requireAdmin } from '../../../../utils/auth-guards'
import { toHttpError } from '../../../../utils/http'
import { deleteLeague } from '../../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  try {
    await deleteLeague(db, id)
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
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
