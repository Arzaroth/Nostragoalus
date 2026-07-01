import { db } from '../../../db'
import { getSessionUser } from '../../utils/auth-guards'
import { listRoadmapItems } from '../../utils/roadmap/service'

export default defineEventHandler(async (event) => {
  // Public endpoint, but a signed-in viewer gets viewerHasVoted per item so the
  // upvote buttons render in the right state without a second round trip.
  const viewer = await getSessionUser(event)
  const items = await listRoadmapItems(db, { viewerId: viewer?.id ?? null })
  return {
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      status: i.status,
      position: i.position,
      voteCount: i.voteCount,
      viewerHasVoted: i.viewerHasVoted,
      updatedAt: i.updatedAt,
    })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Roadmap"],
    "summary": "List roadmap items",
    "description": "Public roadmap: planned, in-progress and shipped features plus community suggestions, each with its upvote count. Hidden (rejected) items are omitted.",
    "responses": {
      "200": {
        "description": "All visible roadmap items ordered by status then position.",
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
                      "status": { "type": "string", "enum": ["PLANNED", "IN_PROGRESS", "SHIPPED", "SUGGESTED"] },
                      "position": { "type": "integer" },
                      "voteCount": { "type": "integer" },
                      "viewerHasVoted": { "type": "boolean" },
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
