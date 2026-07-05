import { db } from '../../../../db'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { getCompetitionById } from '../../../utils/competitions/store'
import { canSeeJoinCode } from '../../../utils/leagues/permissions'
import { countLeagueMembers, listLeagueMembers, resolveLeagueView } from '../../../utils/leagues/service'
import { toHttpError } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  let resolved
  try {
    resolved = await resolveLeagueView(db, id, user.id, { resolveAdmin: () => isAdmin(event) })
  } catch (error) {
    throw toHttpError(error)
  }
  const { league, membership } = resolved
  const admin = membership ? false : await isAdmin(event)
  const includePrivate = !!membership || admin
  const [competition, members, totalMembers] = await Promise.all([
    getCompetitionById(db, league.competitionId),
    // Admin-hidden members are off the roster for everyone but site admins
    // (and the hidden member themselves); the count below stays honest.
    listLeagueMembers(db, id, { includePrivate, includeHidden: admin, viewerId: user.id }),
    countLeagueMembers(db, id),
  ])
  return {
    league: {
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      description: league.description,
      role: membership?.role ?? null,
      memberCount: totalMembers,
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
