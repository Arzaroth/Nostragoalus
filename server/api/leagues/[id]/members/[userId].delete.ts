import { db } from '../../../../../db'
import { requireUser } from '../../../../utils/auth-guards'
import { toHttpError } from '../../../../utils/http'
import { getLeague, kickMember } from '../../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const targetUserId = getRouterParam(event, 'userId')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  try {
    await kickMember(db, { leagueId: id, actorUserId: user.id, targetUserId })
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Kick a member",
    "description": "Owners kick moderators and members; moderators kick members. Kicks are remembered so SSO auto-join cannot undo them.",
    "responses": {
      "200": { "description": "Removed." },
      "400": { "description": "Tried to kick yourself (use leave)." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Insufficient league role." },
      "404": { "description": "Unknown league or target not a member." }
    }
  },
})
