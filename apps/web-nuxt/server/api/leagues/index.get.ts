import { z } from 'zod'
import { db } from '../../../db'
import { competitionRefSchema } from '../../schemas/competition'
import { leagueModeSchema, leagueRoleSchema, leagueVisibilitySchema } from '../../schemas/league-list'
import { getCompetitionBySlug } from '../../utils/competitions/store'
import { listUserLeagues } from '../../utils/leagues/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })

// One row of listUserLeagues (LeagueSummary): the caller's membership with role,
// mode, member count and - for owners/moderators only - the join code.
const leagueSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  visibility: leagueVisibilitySchema,
  mode: leagueModeSchema,
  lives: z.number().nullable(),
  role: leagueRoleSchema,
  picksSynced: z.boolean(),
  memberCount: z.number(),
  chatEnabled: z.boolean(),
  competition: competitionRefSchema,
  joinCode: z.string().optional(),
})

const responseSchema = z.object({ leagues: z.array(leagueSummarySchema) })

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  let competitionId: string | undefined
  if (query.competition) {
    const competition = await getCompetitionBySlug(db, query.competition)
    if (!competition) return { leagues: [] }
    competitionId = competition.id
  }
  return { leagues: await listUserLeagues(db, user.id, competitionId) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "My leagues",
    "description": "Leagues the signed-in user belongs to, with role and member count. Join code included for owners/moderators only.",
    "parameters": [
      { "in": "query", "name": "competition", "required": false, "description": "Competition slug filter.", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "List of league memberships." },
      "401": { "description": "Not signed in." }
    }
  },
})
