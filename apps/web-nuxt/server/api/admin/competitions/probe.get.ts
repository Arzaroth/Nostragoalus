import { z } from 'zod'
import { defineReadHandler } from '../../../utils/read-handler'
import { probeCompetition } from '../../../utils/competitions/probe'
import { MATCH_PROVIDERS } from '../../../utils/providers/factory'

const querySchema = z.object({
  provider: z.enum(MATCH_PROVIDERS),
  externalCompetitionId: z.string().min(1).max(64),
  seasonHint: z.string().min(1).max(16).optional(),
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
