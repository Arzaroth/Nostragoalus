import { z } from 'zod'
import { db } from '../../../../db'
import { getCompetitionBySlug } from '../../../utils/competitions/store'
import { listLeaguesAdmin } from '../../../utils/leagues/service'
import { defineReadHandler } from '../../../utils/read-handler'
import { adminCompetitionRefSchema } from '../../../schemas/admin-league'

const querySchema = z.object({ competition: z.string().optional() })

const adminLeagueRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibility: z.string(),
  joinCode: z.string(),
  memberCount: z.number(),
  competition: adminCompetitionRefSchema,
  owner: z.object({ userId: z.string(), name: z.string() }).nullable(),
  autoJoinProviderIds: z.array(z.string()),
  createdAt: z.date(),
})
const responseSchema = z.object({ leagues: z.array(adminLeagueRowSchema) })

export default defineReadHandler({ response: responseSchema, auth: 'admin', query: querySchema }, async ({ query }) => {
  const slug = query.competition || null
  let competitionId: string | undefined
  if (slug) {
    const competition = await getCompetitionBySlug(db, slug)
    if (!competition) return { leagues: [] }
    competitionId = competition.id
  }
  return { leagues: await listLeaguesAdmin(db, competitionId) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "List leagues",
    "description": "Internal: every league with owner, member count, join code and SSO auto-join links.",
    "parameters": [
      { "in": "query", "name": "competition", "required": false, "description": "Competition slug filter.", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "League list." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." }
    }
  },
})
