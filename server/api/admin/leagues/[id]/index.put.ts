import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { getLeague, renameLeague, setLeagueVisibility } from '../../../../utils/leagues/service'

const bodySchema = z
  .object({
    name: z.string().trim().min(3).max(50).optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
  })
  .refine((b) => b.name !== undefined || b.visibility !== undefined, { message: 'nothing to update' })

export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ event, body }) => {
  const id = getRouterParam(event, 'id')!
  if (!(await getLeague(db, id))) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  if (body.name !== undefined) await renameLeague(db, id, body.name)
  if (body.visibility !== undefined) await setLeagueVisibility(db, id, body.visibility)
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Update a league",
    "description": "Internal: rename or change visibility.",
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
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown league." },
      "422": { "description": "Invalid or empty body." }
    }
  },
})
