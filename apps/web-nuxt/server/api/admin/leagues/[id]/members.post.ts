import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { adminAddMember } from '../../../../utils/leagues/service'
import { okSchema } from '../../../../schemas/chat'

const bodySchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['OWNER', 'MODERATOR', 'MEMBER']).optional(),
})

export default defineValidatedHandler({ admin: true, body: bodySchema, response: okSchema }, async ({ event, body }) => {
  const id = getRouterParam(event, 'id')!
  await adminAddMember(db, { leagueId: id, userId: body.userId, role: body.role })
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Add a user to a league",
    "description": "Internal: upserts the membership, clears a past leave, and assigning OWNER demotes the current owner.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "userId": { "type": "string" },
              "role": { "type": "string", "enum": ["OWNER", "MODERATOR", "MEMBER"] }
            },
            "required": ["userId"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Added." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown league or user." },
      "422": { "description": "Invalid body." }
    }
  },
})
