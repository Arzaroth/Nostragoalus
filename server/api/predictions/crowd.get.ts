import { z } from 'zod'
import { db } from '../../../db'
import { crowdTotalSchema } from '../../schemas/prediction'
import { isAdmin } from '../../utils/auth-guards'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { resolveLeagueView } from '../../utils/leagues/service'
import { getCrowdTotals } from '../../utils/predictions/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional(), league: z.string().optional() })
const responseSchema = z.object({
  totals: z.record(z.string(), crowdTotalSchema),
  league: z.object({ id: z.string(), name: z.string() }).optional(),
})

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ event, user, query }) => {
  // League crowd is display-only; the scoring bonus always uses everyone.
  if (query.league) {
    // Members/admins only: the live crowd consensus is a members feature (the
    // WS league channel is members-only too), and folding private-profile
    // members into a small public league's totals would deanonymize them.
    const { league } = await resolveLeagueView(db, query.league, user.id, {
      membersOnly: true,
      resolveAdmin: () => isAdmin(event),
    })
    const competition = await getCompetitionById(db, league.competitionId)
    if (query.competition && competition && query.competition !== competition.slug) {
      throw createError({ statusCode: 400, statusMessage: 'League belongs to another competition' })
    }
    return {
      totals: await getCrowdTotals(db, league.competitionId, { leagueId: league.id }),
      league: { id: league.id, name: league.name },
    }
  }

  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) return { totals: {} }
  return { totals: await getCrowdTotals(db, competition.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Predictions"],
    "summary": "Crowd totals",
    "description": "The combined total of every player's prediction per match (1-1 + 2-1 + 4-0 shows as 7-2), with the number of predictions. Shown under prediction inputs when the account preference is enabled. With ?league=, totals cover only that league's members (display only - the scoring crowd bonus is always computed from everyone).",
    "parameters": [
      { "in": "query", "name": "competition", "required": false, "description": "Competition slug.", "schema": { "type": "string" } },
      { "in": "query", "name": "league", "required": false, "description": "League id: totals over that league's members (members, public leagues, or admins).", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "Map of matchId to {home, away, count}." },
      "400": { "description": "League belongs to another competition than the one requested." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown league, or private league the caller is not in." }
    }
  },
})
