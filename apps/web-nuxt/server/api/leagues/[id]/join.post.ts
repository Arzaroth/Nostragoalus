import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { joinPublicLeague } from '../../../utils/leagues/service'
import { leagueRoleSchema, leagueVisibilitySchema } from '../../../schemas/league'

const responseSchema = z.object({
  league: z.object({
    id: z.string(),
    name: z.string(),
    visibility: leagueVisibilitySchema,
    role: leagueRoleSchema,
  }),
})

export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  const { league, role } = await joinPublicLeague(db, { userId: user.id, leagueId: id })
  return { league: { id: league.id, name: league.name, visibility: league.visibility, role } }
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
