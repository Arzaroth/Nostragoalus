import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { getLeague, getMembership, setMemberRole } from '../../../../utils/leagues/service'

const bodySchema = z.object({ role: z.enum(['MEMBER', 'MODERATOR']) })

export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  const targetUserId = getRouterParam(event, 'userId')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, id, user.id)
  if (membership?.role !== 'OWNER') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  await setMemberRole(db, { leagueId: id, targetUserId, role: body.role })
  return { ok: true }
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
