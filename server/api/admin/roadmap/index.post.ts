import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { createRoadmapItem } from '../../../utils/roadmap/service'
import { adminRoadmapItemSchema } from '../../../schemas/admin-league'

const bodySchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'SHIPPED']).optional(),
})

const responseSchema = z.object({ item: adminRoadmapItemSchema })

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ body }) => {
  const item = await createRoadmapItem(db, body)
  return { item }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Create a roadmap item",
    "description": "Internal: add an entry to the public roadmap.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "title": { "type": "string", "description": "3-120 chars." },
              "description": { "type": "string", "description": "Up to 2000 chars." },
              "status": { "type": "string", "enum": ["PLANNED", "IN_PROGRESS", "SHIPPED"] }
            },
            "required": ["title"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The created item." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "422": { "description": "Invalid body." }
    }
  },
})
