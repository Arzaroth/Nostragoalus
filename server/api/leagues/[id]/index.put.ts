import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import {
  renameLeague,
  resolveLeagueManage,
  setLeagueDescription,
  setLeagueFeaturedTeam,
  setLeagueVisibility,
} from '../../../utils/leagues/service'

const bodySchema = z
  .object({
    name: z.string().trim().min(3).max(50).optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
    // Markdown source for the league blurb; null (or blank) clears it.
    description: z.string().max(10_000).nullable().optional(),
    // FIFA tricode of the league's TEAM_SPECIALIST team; null clears it. The
    // service rejects a code not in the competition (422).
    featuredTeamCode: z.string().max(8).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'nothing to update' })

export default defineValidatedHandler({ body: bodySchema }, async ({ event, body, user }) => {
  const id = getRouterParam(event, 'id')!
  const { membership } = await resolveLeagueManage(db, id, user.id)
  if (body.name !== undefined) {
    await renameLeague(db, id, body.name)
  }
  if (body.visibility !== undefined) {
    // Flipping privacy is an ownership decision, not day-to-day moderation.
    if (membership?.role !== 'OWNER') throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    await setLeagueVisibility(db, id, body.visibility)
  }
  if (body.description !== undefined) {
    await setLeagueDescription(db, id, body.description)
  }
  if (body.featuredTeamCode !== undefined) {
    await setLeagueFeaturedTeam(db, id, body.featuredTeamCode)
  }
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Update a league (name, visibility, description, featured team)",
    "description": "Name/description/featured team: owner or moderator. Visibility: owner only.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "name": { "type": "string", "description": "3-50 chars." },
              "visibility": { "type": "string", "enum": ["PRIVATE", "PUBLIC"] },
              "description": { "type": "string", "nullable": true, "description": "Markdown blurb; null or blank clears it." },
              "featuredTeamCode": { "type": "string", "nullable": true, "description": "FIFA tricode for the Team Specialist prize; null clears it." }
            }
          }
        }
      }
    },
    "responses": {
      "200": { "description": "Updated." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Insufficient league role." },
      "404": { "description": "Unknown league." },
      "422": { "description": "Invalid body, or a featured team not in the competition." }
    }
  },
})
