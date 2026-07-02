import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { reorderColumn } from '../../../utils/roadmap/service'

// Static path: takes precedence over the sibling [id] route, so this is never
// read as id="reorder".
const bodySchema = z.object({
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'SHIPPED', 'SUGGESTED']),
  // The full ordered id list for the target column after a drag drop.
  ids: z.array(z.string()).max(1000),
})

export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ body }) => {
  await reorderColumn(db, body.status, body.ids)
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Reorder a roadmap column (kanban drag-drop)",
    "description": "Internal: set the full ordering of one status column. Every id is placed at its array index in that status; a card dragged in from another column takes the new status, and a pending suggestion promoted onto the roadmap is auto-approved.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["status", "ids"],
            "properties": {
              "status": { "type": "string", "enum": ["PLANNED", "IN_PROGRESS", "SHIPPED", "SUGGESTED"] },
              "ids": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The column order was persisted." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "422": { "description": "Invalid body." }
    }
  },
})
