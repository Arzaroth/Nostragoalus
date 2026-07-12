import { z } from 'zod'
import { db } from '../../../../db'
import { isAdmin } from '../../../utils/auth-guards'
import { getCompetitionById } from '../../../utils/competitions/store'
import { canSeeJoinCode } from '../../../utils/leagues/permissions'
import { countLeagueMembers, listLeagueMembers, resolveLeagueView } from '../../../utils/leagues/service'
import { defineReadHandler } from '../../../utils/read-handler'
import { leagueModeSchema, leagueRoleSchema, leagueVisibilitySchema } from '../../../schemas/league'

const memberRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  role: leagueRoleSchema,
  joinedAt: z.date(),
})

const responseSchema = z.object({
  league: z.object({
    id: z.string(),
    name: z.string(),
    visibility: leagueVisibilitySchema,
    description: z.string().nullable(),
    mode: leagueModeSchema,
    lives: z.number().nullable(),
    role: leagueRoleSchema.nullable(),
    memberCount: z.number(),
    competition: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullable(),
    joinCode: z.string().optional(),
  }),
  members: z.array(memberRowSchema),
})

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  const { league, membership } = await resolveLeagueView(db, id, user.id, { resolveAdmin: () => isAdmin(event) })
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
      mode: league.mode,
      lives: league.lives,
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
