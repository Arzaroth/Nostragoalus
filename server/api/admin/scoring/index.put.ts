import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { getCompetitionBySlug } from '../../../utils/competitions/store'
import { saveScoringConfig } from '../../../utils/scoring/admin'
import { saveScoringConfigSchema } from '../../../utils/scoring/schema'
import { NotFoundError } from '../../../utils/errors'

const responseSchema = z.object({ version: z.number(), recomputed: z.number() })

export default defineValidatedHandler({ admin: true, body: saveScoringConfigSchema, response: responseSchema }, async ({ body }) => {
  let competitionId: string | null = null
  if (body.competition) {
    const competition = await getCompetitionBySlug(db, body.competition)
    if (!competition) throw new NotFoundError('competition not found')
    competitionId = competition.id
  }
  return saveScoringConfig(db, competitionId, body.rules)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Save scoring config",
    "description": "Upsert the default scoring config (omit competition) or a per-competition override, then recompute every affected competition's ladder.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "competition": {
                "type": "string",
                "nullable": true,
                "description": "Competition slug to override; omit or null for the default."
              },
              "rules": {
                "type": "object",
                "description": "Full scoring ruleset."
              }
            },
            "required": [
              "rules"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Saved; returns the new config version and how many matches were rescored."
      },
      "403": {
        "description": "Not an admin."
      },
      "404": {
        "description": "Unknown competition."
      },
      "422": {
        "description": "Invalid ruleset."
      }
    }
  },
})
