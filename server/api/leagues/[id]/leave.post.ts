import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { toHttpError } from '../../../utils/http'
import { leaveLeague } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  try {
    await leaveLeague(db, { leagueId: id, userId: user.id })
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Leave a league",
    "description": "Leaving is remembered: SSO auto-join will not re-add this user. An owner with members must transfer ownership or delete instead; the last member leaving keeps the (empty) league alive - its next joiner becomes owner.",
    "responses": {
      "200": { "description": "Left." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Not a member." },
      "409": { "description": "Owner with remaining members." }
    }
  },
})
