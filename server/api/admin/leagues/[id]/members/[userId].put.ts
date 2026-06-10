import { z } from 'zod'
import { db } from '../../../../../../db'
import { defineValidatedHandler } from '../../../../../utils/validated-handler'
import { setAdminMemberRole } from '../../../../../utils/leagues/service'

const bodySchema = z.object({ role: z.enum(['OWNER', 'MODERATOR', 'MEMBER']) })

export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ event, body }) => {
  const id = getRouterParam(event, 'id')!
  const userId = getRouterParam(event, 'userId')!
  await setAdminMemberRole(db, { leagueId: id, userId, role: body.role })
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Set a member's league role",
    "description": "Internal: any role; assigning OWNER demotes the current owner.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": { "role": { "type": "string", "enum": ["OWNER", "MODERATOR", "MEMBER"] } },
            "required": ["role"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Role updated." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown league or target not a member." },
      "422": { "description": "Invalid body." }
    }
  },
})
