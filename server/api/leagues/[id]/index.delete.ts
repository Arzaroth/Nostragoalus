import { db } from '../../../../db'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { deleteLeague, getLeague, getMembership } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, id, user.id)
  if (membership?.role !== 'OWNER' && !(await isAdmin(event))) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  await deleteLeague(db, id)
  return { ok: true }
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
