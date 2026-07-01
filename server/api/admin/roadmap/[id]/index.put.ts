import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { updateRoadmapItem } from '../../../../utils/roadmap/service'

const bodySchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    // SUGGESTED lets an admin demote back to (or promote from) the community
    // column; moderationStatus REJECTED hides a spam suggestion, APPROVED restores it.
    status: z.enum(['PLANNED', 'IN_PROGRESS', 'SHIPPED', 'SUGGESTED']).optional(),
    position: z.number().int().min(0).optional(),
    moderationStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  })
  .refine(
    (b) =>
      b.title !== undefined ||
      b.description !== undefined ||
      b.status !== undefined ||
      b.position !== undefined ||
      b.moderationStatus !== undefined,
    { message: 'nothing to update' },
  )

export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ event, body }) => {
  const id = getRouterParam(event, 'id')!
  const item = await updateRoadmapItem(db, id, body)
  return { item }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Update a roadmap item",
    "description": "Internal: edit title/description, move between statuses, or reorder.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "title": { "type": "string", "description": "3-120 chars." },
              "description": { "type": "string", "nullable": true },
              "status": { "type": "string", "enum": ["PLANNED", "IN_PROGRESS", "SHIPPED", "SUGGESTED"] },
              "position": { "type": "integer", "minimum": 0 },
              "moderationStatus": { "type": "string", "enum": ["PENDING", "APPROVED", "REJECTED"] }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The updated item." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown item." },
      "422": { "description": "Invalid or empty body." }
    }
  },
})
