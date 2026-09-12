import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { setCompetitionActive } from '../../../../utils/competitions/store'
import { NotFoundError } from '../../../../utils/errors'

const bodySchema = z.object({ isActive: z.boolean() })
const responseSchema = z.object({ slug: z.string(), isActive: z.boolean() })
// Validated rather than cast: `as string` would hand an undefined straight to a
// drizzle eq() if the route segment were ever renamed, which builds a malformed
// condition instead of a clean 404.
const slugSchema = z.string().min(1).max(64)

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ event, body }) => {
  const parsed = slugSchema.safeParse(getRouterParam(event, 'slug'))
  if (!parsed.success) throw new NotFoundError('competition not found')
  const row = await setCompetitionActive(db, parsed.data, body.isActive)
  return { slug: row.slug, isActive: row.isActive }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Archive or restore a competition",
    "description": "Archiving hides a competition from the switcher and from the default resolver, keeping every prediction, trophy, league and chat room attached to it. There is deliberately no delete: competition cascades into round, match, competition_award, user_achievement and showcase_pin, so removing a row would take a tournament's whole history with it. Archiving the current default hands the default to the newest active season.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": { "isActive": { "type": "boolean" } },
            "required": ["isActive"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "{ slug, isActive }." },
      "403": { "description": "Not an admin." },
      "404": { "description": "Unknown competition." },
      "422": { "description": "Invalid payload." }
    }
  },
})
