import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { toHttpError } from '../../../utils/http'
import { joinPublicLeague } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  try {
    const league = await joinPublicLeague(db, { userId: user.id, leagueId: id })
    return { league: { id: league.id, name: league.name, visibility: league.visibility, role: 'MEMBER' } }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Join a public league",
    "description": "One-click join, no code needed. Private leagues answer 404 so ids never leak existence.",
    "responses": {
      "200": { "description": "Joined." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown or private league." },
      "409": { "description": "Already a member." }
    }
  },
})
