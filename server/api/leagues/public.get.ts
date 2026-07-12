import { z } from 'zod'
import { db } from '../../../db'
import { competitionRefSchema } from '../../schemas/competition'
import { resolveCompetition } from '../../utils/competitions/store'
import { listPublicLeagues } from '../../utils/leagues/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })
const responseSchema = z.object({
  competition: competitionRefSchema.nullable(),
  leagues: z.array(z.object({ id: z.string(), name: z.string(), memberCount: z.number() })),
})

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) return { competition: null, leagues: [] }
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    leagues: await listPublicLeagues(db, competition.id),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Browse public leagues",
    "description": "Public leagues of a competition; anyone signed in can view their rankings or join with one click.",
    "parameters": [
      { "in": "query", "name": "competition", "required": false, "description": "Competition slug. Defaults to the current tournament.", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "Public leagues with member counts." },
      "401": { "description": "Not signed in." }
    }
  },
})
