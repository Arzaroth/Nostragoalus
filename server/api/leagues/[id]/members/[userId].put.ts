import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { resolveLeagueManage, setMemberRole } from '../../../../utils/leagues/service'

const bodySchema = z.object({ role: z.enum(['MEMBER', 'MODERATOR']) })

const responseSchema = z.object({ ok: z.literal(true) })

export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  const targetUserId = getRouterParam(event, 'userId')!
  await resolveLeagueManage(db, id, user.id, { requiredRole: 'OWNER' })
  await setMemberRole(db, { leagueId: id, targetUserId, role: body.role })
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Promote or demote a member",
    "description": "Owner only, between MEMBER and MODERATOR. Ownership moves through the transfer endpoint instead.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": { "role": { "type": "string", "enum": ["MEMBER", "MODERATOR"] } },
            "required": ["role"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Role updated." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Not the owner." },
      "404": { "description": "Unknown league or target not a member." },
      "409": { "description": "Target is the owner." },
      "422": { "description": "Invalid body." }
    }
  },
})
