import { z } from 'zod'
import { db } from '../../../../db'
import { getLeagueOverrides } from '../../../utils/predictions/service'
import { defineReadHandler } from '../../../utils/read-handler'

const overrideRowSchema = z.object({
  matchId: z.string(),
  homeGoals: z.number(),
  awayGoals: z.number(),
  isOutcomeOnly: z.boolean(),
  wager: z.number().nullable(),
  isJoker: z.boolean(),
})

const responseSchema = z.object({ overrides: z.array(overrideRowSchema) })

// The caller's own override picks in a league (for the per-league pick editor).
// Returns only your own rows, so there is nothing to gate beyond auth.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const leagueId = getRouterParam(event, 'id')!
  return { overrides: await getLeagueOverrides(db, leagueId, user.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "My override picks in a league",
    "responses": {
      "200": { "description": "The caller's override picks for the league." },
      "401": { "description": "Not signed in." }
    }
  },
})
