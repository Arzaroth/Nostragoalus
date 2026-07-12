import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { db } from '../../../db'
import { roadmapItem } from '../../../db/schema'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { createRateLimiter } from '../../utils/rate-limit'
import {
  SUGGESTION_DESCRIPTION_MAX,
  SUGGESTION_TITLE_MAX,
  SUGGESTION_TITLE_MIN,
  createSuggestion,
} from '../../utils/roadmap/service'

const bodySchema = z.object({
  title: z.string().trim().min(SUGGESTION_TITLE_MIN).max(SUGGESTION_TITLE_MAX),
  description: z.string().trim().max(SUGGESTION_DESCRIPTION_MAX).optional(),
})

// createSuggestion returns the freshly inserted row (`.returning()` with no
// projection), so the response mirrors the whole roadmap_item table.
const responseSchema = z.object({ item: createSelectSchema(roadmapItem) })

// Suggestions are public-immediately, so the only spam gate is auth (enforced by
// the non-admin handler) plus this per-user cap: a handful per hour is plenty for
// a genuine feature wishlist and pointless for a flooder.
const limiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 })

export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user }) => {
  if (!limiter.allow(user.id)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many suggestions, try again later' })
  }
  const item = await createSuggestion(db, {
    authorId: user.id,
    title: body.title,
    description: body.description,
  })
  return { item }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Roadmap"],
    "summary": "Submit a roadmap suggestion",
    "description": "Signed-in users propose a feature. It appears in the community suggestions column immediately and can be upvoted; admins triage it onto the roadmap or hide it. Rate limited per user.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "title": { "type": "string", "description": "3-120 chars." },
              "description": { "type": "string", "description": "Up to 2000 chars." }
            },
            "required": ["title"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The created suggestion." },
      "401": { "description": "Not signed in." },
      "422": { "description": "Invalid body." },
      "429": { "description": "Rate limit exceeded." }
    }
  },
})
