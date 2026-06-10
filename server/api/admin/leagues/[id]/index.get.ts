import { db } from '../../../../../db'
import { requireAdmin } from '../../../../utils/auth-guards'
import { getCompetitionById } from '../../../../utils/competitions/store'
import { getLeague, listLeagueMembers } from '../../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const league = await getLeague(db, id)
  if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const [competition, members] = await Promise.all([getCompetitionById(db, league.competitionId), listLeagueMembers(db, id)])
  return {
    league: {
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      joinCode: league.joinCode,
      competition: competition ? { id: competition.id, slug: competition.slug, name: competition.name } : null,
    },
    members,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "League detail",
    "description": "Internal: league with members and join code.",
    "responses": {
      "200": { "description": "League with members." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown league." }
    }
  },
})
