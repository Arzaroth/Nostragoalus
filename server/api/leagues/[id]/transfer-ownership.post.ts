import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { resolveLeagueManage, transferOwnership } from '../../../utils/leagues/service'

const bodySchema = z.object({ userId: z.string().min(1) })

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  await resolveLeagueManage(db, id, user.id, { requiredRole: 'OWNER' })
  await transferOwnership(db, { leagueId: id, fromUserId: user.id, toUserId: body.userId })
  return { ok: true as const }
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
