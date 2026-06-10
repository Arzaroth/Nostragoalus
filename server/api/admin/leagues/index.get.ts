import { db } from '../../../../db'
import { requireAdmin } from '../../../utils/auth-guards'
import { getCompetitionBySlug } from '../../../utils/competitions/store'
import { listLeaguesAdmin } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const slug = (getQuery(event).competition as string) || null
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
