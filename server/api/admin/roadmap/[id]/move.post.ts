import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { reorderRoadmapItem } from '../../../../utils/roadmap/service'

const bodySchema = z.object({ direction: z.enum(['up', 'down']) })

export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ event, body }) => {
  const id = getRouterParam(event, 'id')!
  const item = await reorderRoadmapItem(db, id, body.direction)
  return { item }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Reorder a roadmap item",
    "description": "Internal: swap an item with its neighbor in the same status column (atomic).",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["direction"],
            "properties": { "direction": { "type": "string", "enum": ["up", "down"] } }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The moved item (or unchanged if already at the edge)." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown item." },
      "422": { "description": "Invalid body." }
    }
  },
})
