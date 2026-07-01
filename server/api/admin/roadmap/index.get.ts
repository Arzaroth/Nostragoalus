import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { listRoadmapItems } from '../../../utils/roadmap/service'

// Admin triage view: everything the public list omits (REJECTED/hidden items)
// plus author and moderation state, so an admin can promote suggestions onto the
// roadmap or hide spam.
export default defineValidatedHandler({ admin: true }, async () => {
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
