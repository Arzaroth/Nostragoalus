import { z } from 'zod'
import { db } from '../../../db'
import { leagueModeSchema } from '../../schemas/league-list'
import { getCompetitionBySlug } from '../../utils/competitions/store'
import { getLeagueCompleteness } from '../../utils/predictions/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })

// One LeagueCompleteness row: a league's mode, its pick-completeness summary, and
// the per-match issues (matches not yet COMPLETE).
const leagueCompletenessSchema = z.object({
  leagueId: z.string(),
  name: z.string(),
  mode: leagueModeSchema,
  summary: z.object({
    total: z.number(),
    complete: z.number(),
    incomplete: z.number(),
    missing: z.number(),
    needsExact: z.number(),
    needsStake: z.number(),
  }),
  issues: z.array(
    z.object({
      matchId: z.string(),
      reason: z.enum(['NEEDS_PICK', 'NEEDS_EXACT', 'NEEDS_STAKE']),
    }),
  ),
})

const responseSchema = z.object({ leagues: z.array(leagueCompletenessSchema) })

// Per-league completeness of the caller's picks for a competition (the nudge):
// which leagues have every open match covered, and which still need a real score
// (NORMAL) or a stake (HARD).
export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  // Kept as an in-handler 400 (not a required-query 422) so the documented
  // "competition required" contract holds.
  if (!query.competition) throw createError({ statusCode: 400, statusMessage: 'competition required' })
  const competition = await getCompetitionBySlug(db, query.competition)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'Unknown competition' })
  return { leagues: await getLeagueCompleteness(db, user.id, competition.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "My pick completeness per league",
    "parameters": [{ "name": "competition", "in": "query", "required": true, "schema": { "type": "string" } }],
    "responses": {
      "200": { "description": "Per-league completeness summaries." },
      "400": { "description": "Missing competition." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown competition." }
    }
  },
})
