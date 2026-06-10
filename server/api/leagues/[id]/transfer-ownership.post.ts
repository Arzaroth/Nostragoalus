import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { getLeague, getMembership, transferOwnership } from '../../../utils/leagues/service'

const bodySchema = z.object({ userId: z.string().min(1) })

export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, id, user.id)
  if (membership?.role !== 'OWNER') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  await transferOwnership(db, { leagueId: id, fromUserId: user.id, toUserId: body.userId })
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Transfer ownership",
    "description": "Owner only. The previous owner becomes a moderator.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": { "userId": { "type": "string" } },
            "required": ["userId"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Ownership transferred." },
      "400": { "description": "Target is already the owner." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not the owner." },
      "404": { "description": "Unknown league or target not a member." },
      "422": { "description": "Invalid body." }
    }
  },
})
