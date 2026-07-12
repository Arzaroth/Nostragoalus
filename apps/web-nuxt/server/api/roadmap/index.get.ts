import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { db } from '../../../db'
import { roadmapItem } from '../../../db/schema'
import { getSessionUser } from '../../utils/auth-guards'
import { defineReadHandler } from '../../utils/read-handler'
import { listRoadmapItems } from '../../utils/roadmap/service'

const cols = createSelectSchema(roadmapItem)
const responseSchema = z.object({
  items: z.array(
    z.object({
      id: cols.shape.id,
      title: cols.shape.title,
      description: cols.shape.description,
      status: cols.shape.status,
      position: cols.shape.position,
      voteCount: z.number(),
      viewerHasVoted: z.boolean(),
      underReview: z.boolean(),
      updatedAt: cols.shape.updatedAt,
    }),
  ),
})

export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
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
      // Hybrid moderation: a still-pending suggestion is public but flagged
      // "under review". Expose only the boolean, not the raw moderation state.
      underReview: i.moderationStatus === 'PENDING',
      updatedAt: i.updatedAt,
    })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Roadmap"],
    "summary": "List roadmap items",
    "description": "Public roadmap: planned, in-progress and shipped features plus community suggestions, each with its upvote count. Pending suggestions are shown flagged underReview; hidden (rejected) items are omitted.",
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
                      "underReview": { "type": "boolean" },
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
