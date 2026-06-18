import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { getCompetitionReactionTotals, getMyCompetitionReactions } from '../../utils/reactions/service'
import { getSessionUser, isAdmin } from '../../utils/auth-guards'
import { getLeague, getMembership } from '../../utils/leagues/service'

// Bulk reaction counts for a whole competition's matches, keyed by match id: the
// fixtures list fetches once instead of one request per card. Global counts are
// public (read-only aggregates, no PII), like the per-match route; ?league=
// counts stay members-only, like crowd totals. `mine` maps the caller's own
// reaction per match (empty for guests).
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const user = await getSessionUser(event)

  if (query.league) {
    if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    const league = await getLeague(db, String(query.league))
    if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
    const membership = await getMembership(db, league.id, user.id)
    if (!membership && !(await isAdmin(event))) {
      throw createError({ statusCode: 404, statusMessage: 'League not found' })
    }
    return {
      totals: await getCompetitionReactionTotals(db, league.competitionId, { leagueId: league.id }),
      mine: await getMyCompetitionReactions(db, user.id, league.competitionId),
    }
  }

  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { totals: {}, mine: {} }
  return {
    totals: await getCompetitionReactionTotals(db, competition.id),
    mine: user ? await getMyCompetitionReactions(db, user.id, competition.id) : {},
  }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Reactions"],
    "summary": "Competition reaction counts",
    "description": "Per-emoji reaction counts for every match in a competition that has any reaction, keyed by match id (the fixtures list bulk-fetches this once). Global counts are public; with ?league= the counts cover that league's members only (members or admins). `mine` maps the caller's own reaction per match (empty when signed out).",
    "parameters": [
      { "in": "query", "name": "competition", "required": false, "description": "Competition slug (defaults to the active competition).", "schema": { "type": "string" } },
      { "in": "query", "name": "league", "required": false, "description": "League id: counts over that league's members.", "schema": { "type": "string" } }
    ],
    "responses": {
      "200": { "description": "{ totals: map of matchId to per-emoji counts, mine: map of matchId to the caller's reaction }." },
      "401": { "description": "League scope requested while signed out." },
      "404": { "description": "Unknown league, or a private league the caller is not in." }
    }
  },
})
