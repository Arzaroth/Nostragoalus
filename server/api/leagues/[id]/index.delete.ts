import { db } from '../../../../db'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { toHttpError } from '../../../utils/http'
import { deleteLeague, resolveLeagueManage } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  try {
    await resolveLeagueManage(db, id, user.id, { requiredRole: 'OWNER', resolveAdmin: () => isAdmin(event) })
    await deleteLeague(db, id)
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
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
