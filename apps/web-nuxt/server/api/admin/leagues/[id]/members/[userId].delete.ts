import { db } from '../../../../../../db'
import { getLeague, getMembership, removeMembership } from '../../../../../utils/leagues/service'
import { defineValidatedHandler } from '../../../../../utils/validated-handler'
import { okSchema } from '../../../../../schemas/chat'

export default defineValidatedHandler({ admin: true, response: okSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  if (!(await getMembership(db, id, userId))) throw createError({ statusCode: 404, statusMessage: 'Not a member' })
  await removeMembership(db, id, userId)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Remove a user from a league",
    "description": "Internal: removal is remembered so SSO auto-join cannot re-add the user.",
    "responses": {
      "200": { "description": "Removed." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown league or not a member." }
    }
  },
})
