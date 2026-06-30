import { z } from 'zod'
import { db } from '../../../db'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { getCompetitionBySlug } from '../../utils/competitions/store'
import { createLeague } from '../../utils/leagues/service'

const bodySchema = z.object({
  competition: z.string().min(1),
  name: z.string().trim().min(3).max(50),
  visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
  mode: z.enum(['NORMAL', 'EASY', 'HARD', 'HARDCORE']).optional(),
  // HARDCORE only; ignored for every other mode.
  lives: z.number().int().min(1).max(99).optional(),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const competition = await getCompetitionBySlug(db, body.competition)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'Unknown competition' })
  const league = await createLeague(db, {
    competitionId: competition.id,
    name: body.name,
    visibility: body.visibility,
    mode: body.mode,
    lives: body.lives,
    ownerId: user.id,
  })
  return {
    league: {
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      mode: league.mode,
      lives: league.lives,
      picksSynced: true,
      joinCode: league.joinCode,
      role: 'OWNER',
      memberCount: 1,
      competition: { id: competition.id, slug: competition.slug, name: competition.name },
    },
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Create a league",
    "description": "Creates a competition-scoped league; the creator becomes its owner. Join codes are regenerable and guesses are rate limited, but treat them as invitations, not secrets.",
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
              "mode": { "type": "string", "enum": ["NORMAL", "EASY", "HARD", "HARDCORE"], "description": "Scoring mode. Non-NORMAL only before kickoff." },
              "lives": { "type": "integer", "minimum": 1, "maximum": 99, "description": "HARDCORE only: wrong outcomes a member survives." }
            },
            "required": ["competition", "name"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The created league with its join code." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown competition." },
      "422": { "description": "Invalid body." }
    }
  },
})
