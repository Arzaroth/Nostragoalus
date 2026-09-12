import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { addCompetition } from '../../../utils/competitions/service'
import { MATCH_PROVIDERS } from '../../../utils/providers/factory'

const bodySchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  provider: z.enum(MATCH_PROVIDERS),
  externalCompetitionId: z.string().min(1).max(64),
  seasonHint: z.string().min(1).max(16).nullable(),
})

const responseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  provider: z.string(),
  externalCompetitionId: z.string(),
  seasonHint: z.string().nullable(),
  isActive: z.boolean(),
})

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ body }) => {
  const row = await addCompetition(db, body)
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    externalCompetitionId: row.externalCompetitionId,
    seasonHint: row.seasonHint,
    isActive: row.isActive,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Add a competition",
    "description": "Creates a competition from a provider and its external id. The season is probed again server-side and the competition is refused unless every fixture would actually reach the match table - a client-side probe result is not trusted. The slug is permanent: it is in every URL, the ng-competition cookie, share images and push deep-links.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "slug": { "type": "string", "description": "URL segment; lowercase letters, digits and single hyphens. Permanent." },
              "name": { "type": "string" },
              "provider": { "type": "string" },
              "externalCompetitionId": { "type": "string", "description": "The provider's own id, e.g. the ESPN league slug." },
              "seasonHint": { "type": "string", "nullable": true }
            },
            "required": ["slug", "name", "provider", "externalCompetitionId", "seasonHint"]
          }
        }
      }
    },
    "responses": {
      "200": { "description": "The created competition." },
      "400": { "description": "Bad slug, or a competition the app cannot ingest." },
      "403": { "description": "Not an admin." },
      "409": { "description": "That slug is taken." },
      "422": { "description": "Invalid payload." },
      "502": { "description": "The provider could not be read." }
    }
  },
})
