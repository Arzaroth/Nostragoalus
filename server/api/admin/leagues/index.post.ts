import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { getCompetitionBySlug } from '../../../utils/competitions/store'
import { adminCreateLeague } from '../../../utils/leagues/service'

const bodySchema = z.object({
  competition: z.string().min(1),
  name: z.string().trim().min(3).max(50),
  visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
  mode: z.enum(['NORMAL', 'EASY', 'HARD', 'HARDCORE']).optional(),
  lives: z.number().int().min(1).max(99).optional(),
  ownerId: z.string().optional(),
})

const responseSchema = z.object({
  league: z.object({
    id: z.string(),
    name: z.string(),
    visibility: z.string(),
    mode: z.string(),
    lives: z.number().nullable(),
    joinCode: z.string(),
  }),
})

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ body }) => {
  const competition = await getCompetitionBySlug(db, body.competition)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'Unknown competition' })
  // Admin has full capability: a moded league can be made even mid-competition.
  const league = await adminCreateLeague(db, {
    competitionId: competition.id,
    name: body.name,
    visibility: body.visibility,
    mode: body.mode,
    lives: body.lives,
    ownerId: body.ownerId,
  })
  return {
    league: { id: league.id, name: league.name, visibility: league.visibility, mode: league.mode, lives: league.lives, joinCode: league.joinCode },
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Create a league",
    "description": "Internal: optionally ownerless (for SSO auto-join leagues; site admins moderate them).",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "competition": { "type": "string", "description": "Competition slug." },
              "name": { "type": "string", "description": "3-50 chars." },
              "visibility": { "type": "string", "enum": ["PRIVATE", "PUBLIC"] },
              "ownerId": { "type": "string" }
            },
            "required": ["competition", "name"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The created league." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." },
      "404": { "description": "Unknown competition or owner." },
      "422": { "description": "Invalid body." }
    }
  },
})
