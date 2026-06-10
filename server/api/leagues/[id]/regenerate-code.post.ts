import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { toHttpError } from '../../../utils/http'
import { canManageLeague } from '../../../utils/leagues/permissions'
import { getLeague, getMembership, regenerateJoinCode } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, id, user.id)
  if (!canManageLeague(membership?.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  try {
    return { joinCode: await regenerateJoinCode(db, id) }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Regenerate the join code",
    "description": "Owner or moderator. Invalidates the previous code - the way to revoke a leaked invitation.",
    "responses": {
      "200": { "description": "The new join code." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Insufficient league role." },
      "404": { "description": "Unknown league." }
    }
  },
})
