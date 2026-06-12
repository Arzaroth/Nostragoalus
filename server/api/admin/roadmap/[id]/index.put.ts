import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { updateRoadmapItem } from '../../../../utils/roadmap/service'

const bodySchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(['PLANNED', 'IN_PROGRESS', 'SHIPPED']).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine(
    (b) => b.title !== undefined || b.description !== undefined || b.status !== undefined || b.position !== undefined,
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
              "status": { "type": "string", "enum": ["PLANNED", "IN_PROGRESS", "SHIPPED"] },
              "position": { "type": "integer", "minimum": 0 }
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
