import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { getCompetitionBySlug } from '../../utils/competitions/store'
import { listUserLeagues } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const slug = (getQuery(event).competition as string) || null
  let competitionId: string | undefined
  if (slug) {
    const competition = await getCompetitionBySlug(db, slug)
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
