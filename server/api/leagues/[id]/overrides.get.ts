import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { getLeagueOverrides } from '../../../utils/predictions/service'

// The caller's own override picks in a league (for the per-league pick editor).
// Returns only your own rows, so there is nothing to gate beyond auth.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const leagueId = getRouterParam(event, 'id')!
  const overrides = await getLeagueOverrides(db, leagueId, user.id)
  return { overrides }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "My override picks in a league",
    "responses": {
      "200": { "description": "The caller's override picks for the league." },
      "401": { "description": "Not signed in." }
    }
  },
})
