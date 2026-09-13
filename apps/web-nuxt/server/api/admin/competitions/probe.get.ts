import { z } from 'zod'
import { defineReadHandler } from '../../../utils/read-handler'
import { probeCompetition } from '../../../utils/competitions/probe'
import { MATCH_PROVIDERS } from '../../../utils/providers/factory'
import { isProviderSport } from '../../../../shared/sport'

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

const querySchema = z.object({
  provider: z.enum(MATCH_PROVIDERS),
  externalCompetitionId: externalCompetitionIdSchema,
  seasonHint: z.string().min(1).max(16).optional(),
  providerSport: providerSportSchema.optional(),
})

const responseSchema = z.object({
  fixtures: z.number(),
  ingestible: z.number(),
  dropped: z.number(),
  groups: z.array(z.string()),
  stages: z.array(z.string()),
  twoLeggedStages: z.array(z.string()),
  hasBracket: z.boolean(),
  supported: z.boolean(),
  blockers: z.array(z.string()),
})

export default defineReadHandler({ response: responseSchema, auth: 'admin', query: querySchema }, async ({ query }) => {
  // probeCompetition raises ProviderError itself, so an unreachable provider
  // surfaces as a 502 rather than as `supported: false`, which would tell the
  // admin the competition is the problem.
  return probeCompetition({
    provider: query.provider,
    providerSport: query.providerSport ?? null,
    externalCompetitionId: query.externalCompetitionId,
    seasonHint: query.seasonHint ?? null,
  })
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Dry-run a competition before adding it",
    "description": "Fetches and normalizes a real season without writing anything, and reports what would actually reach the match table. Blocks on: nothing returned, any fixture that would be silently skipped at insert (a group fixture with no matchday - a domestic league or a single-table league phase), and a two-legged knockout, which the round schema cannot hold. A provider's own 'is this a tournament' flag is not trusted here.",
    "responses": {
      "200": { "description": "{ fixtures, ingestible, dropped, groups, stages, twoLeggedStages, hasBracket, supported, blockers }." },
      "403": { "description": "Not an admin." },
      "422": { "description": "Invalid query." },
      "502": { "description": "The provider could not be read." }
    }
  },
})
