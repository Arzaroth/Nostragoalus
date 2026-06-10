import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { canManageLeague } from '../../../utils/leagues/permissions'
import { getLeague, getMembership, renameLeague, setLeagueVisibility } from '../../../utils/leagues/service'

const bodySchema = z
  .object({
    name: z.string().trim().min(3).max(50).optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
  })
  .refine((b) => b.name !== undefined || b.visibility !== undefined, { message: 'nothing to update' })

export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, id, user.id)
  if (body.name !== undefined) {
    if (!canManageLeague(membership?.role)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    await renameLeague(db, id, body.name)
  }
  if (body.visibility !== undefined) {
    // Flipping privacy is an ownership decision, not day-to-day moderation.
    if (membership?.role !== 'OWNER') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    await setLeagueVisibility(db, id, body.visibility)
  }
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Rename a league or change its visibility",
    "description": "Name: owner or moderator. Visibility: owner only.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "3-50 chars." },
              "visibility": { "type": "string", "enum": ["PRIVATE", "PUBLIC"] }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Updated." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Insufficient league role." },
      "404": { "description": "Unknown league." },
      "422": { "description": "Invalid or empty body." }
    }
  },
})
