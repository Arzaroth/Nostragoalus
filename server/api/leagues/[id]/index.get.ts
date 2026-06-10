import { db } from '../../../../db'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { getCompetitionById } from '../../../utils/competitions/store'
import { canSeeJoinCode } from '../../../utils/leagues/permissions'
import { canViewLeague, getLeague, getMembership, listLeagueMembers } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const league = await getLeague(db, id)
  if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, id, user.id)
  const admin = membership ? false : await isAdmin(event)
  // Private leagues 404 (not 403) for outsiders so ids never leak existence.
  if (!canViewLeague(league, membership, admin)) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const includePrivate = !!membership || admin
  const [competition, members] = await Promise.all([
    getCompetitionById(db, league.competitionId),
    listLeagueMembers(db, id, { includePrivate }),
  ])
  return {
    league: {
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      role: membership?.role ?? null,
      memberCount: members.length,
      competition: competition ? { id: competition.id, slug: competition.slug, name: competition.name } : null,
      ...(canSeeJoinCode(membership?.role) || admin ? { joinCode: league.joinCode } : {}),
    },
    members,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "League detail",
    "description": "League info and member list. Members always; public leagues for anyone signed in; admins for moderation. Join code only for owners/moderators/admins.",
    "responses": {
      "200": { "description": "League with members." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown league, or private league the caller is not in." }
    }
  },
})
