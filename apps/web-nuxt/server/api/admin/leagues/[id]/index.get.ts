import { z } from 'zod'
import { db } from '../../../../../db'
import { getCompetitionById } from '../../../../utils/competitions/store'
import { getLeague, listLeagueMembers } from '../../../../utils/leagues/service'
import { defineReadHandler } from '../../../../utils/read-handler'
import { adminCompetitionRefSchema } from '../../../../schemas/admin-league'

const memberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  role: z.string(),
  joinedAt: z.date(),
})
const responseSchema = z.object({
  league: z.object({
    id: z.string(),
    name: z.string(),
    visibility: z.string(),
    joinCode: z.string(),
    competition: adminCompetitionRefSchema.nullable(),
  }),
  members: z.array(memberSchema),
})

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async ({ event }) => {
  const id = getRouterParam(event, 'id')!
  const league = await getLeague(db, id)
  if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  // Admin moderation view: see every member, hidden or private.
  const [competition, members] = await Promise.all([
    getCompetitionById(db, league.competitionId),
    listLeagueMembers(db, id, { includePrivate: true, includeHidden: true }),
  ])
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
