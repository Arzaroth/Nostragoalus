import { z } from 'zod'
import { db } from '../../../db'
import { reactionEmojiSchema, reactionTotalsSchema } from '../../schemas/dm'
import { getSessionUser, isAdmin } from '../../utils/auth-guards'
import { resolveLeagueView } from '../../utils/leagues/service'
import { getMatchReactionTotals, getMyReaction } from '../../utils/reactions/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ league: z.string().optional() })
const responseSchema = z.object({ totals: reactionTotalsSchema, mine: reactionEmojiSchema.nullable() })

// Global reaction counts are public (read-only aggregates, no PII): the bar
// renders for guests too, just without a highlighted "mine". League-scoped
// counts stay members-only, like crowd totals.
export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ event, query }) => {
  const matchId = getRouterParam(event, 'matchId') as string
  const user = await getSessionUser(event)

  if (query.league) {
    if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    const { league } = await resolveLeagueView(db, query.league, user.id, {
      membersOnly: true,
      resolveAdmin: () => isAdmin(event),
    })
    return {
      totals: await getMatchReactionTotals(db, matchId, { leagueId: league.id }),
      mine: await getMyReaction(db, user.id, matchId),
    }
  }

  return {
    totals: await getMatchReactionTotals(db, matchId),
    mine: user ? await getMyReaction(db, user.id, matchId) : null,
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Reactions"],
    "summary": "Match reaction counts",
    "description": "Per-emoji reaction counts for one match, plus the caller's own reaction (null when signed out or not reacted). Global counts are public; with ?league= the counts cover that league's members only (members or admins).",
    "parameters": [
      { "in": "path", "name": "matchId", "required": true, "description": "Match id.", "schema": { "type": "string", "format": "uuid" } },
      { "in": "query", "name": "league", "required": false, "description": "League id: counts over that league's members.", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "{ totals: per-emoji counts, mine: the caller's reaction or null }." },
      "401": { "description": "League scope requested while signed out." },
      "404": { "description": "Unknown league, or a private league the caller is not in." }
    }
  },
})
