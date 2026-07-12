import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { deleteRoadmapItem } from '../../../../utils/roadmap/service'
import { okSchema } from '../../../../schemas/chat'

export default defineValidatedHandler({ admin: true, response: okSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id')!
  await deleteRoadmapItem(db, id)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Delete a roadmap item",
    "description": "Internal: remove an entry from the public roadmap.",
    "responses": {
      "200": { "description": "Deleted." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown item." }
    }
  },
})
