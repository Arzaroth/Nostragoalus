import { z } from 'zod'
import { db } from '../../../db'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { getCompetitionBySlug } from '../../utils/competitions/store'
import { createLeague } from '../../utils/leagues/service'

const bodySchema = z.object({
  competition: z.string().min(1),
  name: z.string().trim().min(3).max(50),
  visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const competition = await getCompetitionBySlug(db, body.competition)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'Unknown competition' })
  const league = await createLeague(db, {
    competitionId: competition.id,
    name: body.name,
    visibility: body.visibility,
    ownerId: user.id,
  })
  return {
    league: {
      id: league.id,
      name: league.name,
      visibility: league.visibility,
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
              "visibility": { "type": "string", "enum": ["PRIVATE", "PUBLIC"] }
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
