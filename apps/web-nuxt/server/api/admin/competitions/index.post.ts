import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { addCompetition } from '../../../utils/competitions/service'
import { MATCH_PROVIDERS } from '../../../utils/providers/factory'
import { isProviderSport, sportForProvider } from '../../../../shared/sport'

// Bounded AND closed: the value is interpolated into a provider URL and stored
// on the competition row, where an unknown one surfaces only as an opaque
// upstream 400.
const providerSportSchema = z
  .string()
  .min(1)
  .max(8)
  .refine(isProviderSport, 'unknown provider sub-feed')

// Bounded AND shaped: the value is spliced into provider URLs (FIFA, UEFA and
// football-data interpolate it without encoding, some of it as a path segment),
// so a `/`, `?`, `#` or `&` in it would re-point or truncate the request. Every
// provider's real ids are alphanumeric with dots, dashes or a UUID: "17", "3",
// "WC", "eng.1", "14bc12d5-59bd-4c9e-b1cf-653ce66b72b7".
const externalCompetitionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'unexpected characters in the competition id')

const bodySchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  provider: z.enum(MATCH_PROVIDERS),
  externalCompetitionId: externalCompetitionIdSchema,
  seasonHint: z.string().min(1).max(16).nullable(),
  providerSport: providerSportSchema.nullable().optional(),
})

const responseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  provider: z.string(),
  externalCompetitionId: z.string(),
  seasonHint: z.string().nullable(),
  sport: z.string(),
  isActive: z.boolean(),
})

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ body }) => {
  // The sport is looked up from the provider rather than accepted from the
  // client: a provider serves exactly one, so letting it be posted only creates
  // a way to get it wrong.
  const row = await addCompetition(db, { ...body, sport: sportForProvider(body.provider) })
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    provider: row.provider,
    externalCompetitionId: row.externalCompetitionId,
    seasonHint: row.seasonHint,
    sport: row.sport,
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
