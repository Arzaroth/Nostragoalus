import { db } from '../../../db'
import { listRoadmapItems } from '../../utils/roadmap/service'

export default defineEventHandler(async () => {
  const items = await listRoadmapItems(db)
  return {
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      status: i.status,
      position: i.position,
      updatedAt: i.updatedAt,
    })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Roadmap"],
    "summary": "List roadmap items",
    "description": "Public, admin-curated roadmap: planned, in-progress and shipped features.",
    "responses": {
      "200": {
        "description": "All roadmap items ordered by position.",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": {
                "items": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": { "type": "string" },
                      "title": { "type": "string" },
                      "description": { "type": "string", "nullable": true },
                      "status": { "type": "string", "enum": ["PLANNED", "IN_PROGRESS", "SHIPPED"] },
                      "position": { "type": "integer" },
                      "updatedAt": { "type": "string", "format": "date-time" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
})
