import { z } from 'zod'
import { db } from '../../../../db'
import { defineReadHandler } from '../../../utils/read-handler'
import { listRoadmapItems } from '../../../utils/roadmap/service'
import { adminRoadmapItemSchema } from '../../../schemas/admin-league'

const responseSchema = z.object({
  items: z.array(
    adminRoadmapItemSchema
      .pick({
        id: true,
        title: true,
        description: true,
        status: true,
        position: true,
        authorId: true,
        moderationStatus: true,
        updatedAt: true,
      })
      .extend({ voteCount: z.number() }),
  ),
})

// Admin triage view: everything the public list omits (REJECTED/hidden items)
// plus author and moderation state, so an admin can promote suggestions onto the
// roadmap or hide spam.
export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
  const items = await listRoadmapItems(db, { includeHidden: true })
  return {
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      status: i.status,
      position: i.position,
      authorId: i.authorId,
      moderationStatus: i.moderationStatus,
      voteCount: i.voteCount,
      updatedAt: i.updatedAt,
    })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "List all roadmap items (admin)",
    "description": "Internal: every roadmap item including hidden/rejected suggestions, with author, moderation state and upvote count for triage.",
    "responses": {
      "200": { "description": "All roadmap items." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." }
    }
  },
})
