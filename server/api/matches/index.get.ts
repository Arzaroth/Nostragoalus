import { z } from 'zod'
import { db } from '../../../db'
import { matchOddsViewSchema, matchRowSchema } from '../../schemas/match'
import { listMatches } from '../../utils/matches/service'
import { resolveCompetition } from '../../utils/competitions/store'
import { defineReadHandler } from '../../utils/read-handler'
import type { AppStage, MatchStatus } from '../../../shared/types/match'

const querySchema = z.object({
  competition: z.string().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
  // Treat an empty `?matchday=` as absent (no filter), matching the old
  // truthy-check behaviour; `z.coerce` alone would turn '' into 0.
  matchday: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().optional()),
})
const responseSchema = z.object({
  competition: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullable(),
  matches: z.array(matchRowSchema.extend({ odds: matchOddsViewSchema.nullable(), isLocked: z.boolean() })),
})

export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) return { competition: null, matches: [] }

  const matches = await listMatches(db, {
    competitionId: competition.id,
    stage: (query.stage as AppStage) || undefined,
    status: (query.status as MatchStatus) || undefined,
    matchday: query.matchday,
  })

  const now = Date.now()
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    matches: matches.map((m) => ({ ...m, isLocked: new Date(m.kickoffTime).getTime() <= now })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "List fixtures",
    "description": "All fixtures of a competition grouped by round, with scores, status and (when signed in) your predictions.",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Fixture list."
      }
    }
  },
})
