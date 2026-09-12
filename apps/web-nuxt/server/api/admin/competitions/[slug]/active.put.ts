import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { setCompetitionActive } from '../../../../utils/competitions/store'

const bodySchema = z.object({ isActive: z.boolean() })
const responseSchema = z.object({ slug: z.string(), isActive: z.boolean() })

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ event, body }) => {
  const slug = getRouterParam(event, 'slug') as string
  const row = await setCompetitionActive(db, slug, body.isActive)
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
