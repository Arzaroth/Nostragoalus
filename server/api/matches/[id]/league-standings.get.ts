import { db } from '../../../../db'
import { getMatchLeagueStandings } from '../../../utils/leaderboard/match'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { getLeague, getMembership } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const matchId = getRouterParam(event, 'id') as string
  const query = getQuery(event)
  if (!query.league) throw createError({ statusCode: 400, statusMessage: 'league query parameter is required' })

  const user = await requireUser(event)
  const league = await getLeague(db, String(query.league))
  if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, league.id, user.id)
  // Members/admins only: this exposes each member's per-match pick, the same
  // sensitivity the crowd endpoint and the WS league channel restrict. A public
  // league's board would otherwise leak individual picks to any outsider.
  const admin = membership ? false : await isAdmin(event)
  if (!membership && !admin) {
    throw createError({ statusCode: 404, statusMessage: 'League not found' })
  }

  // League mates see each other's picks (post-kickoff) even with private profiles.
  const standings = await getMatchLeagueStandings(db, {
    matchId,
    leagueId: league.id,
    competitionId: league.competitionId,
    viewerId: user.id,
    includePrivate: true,
  })
  return { league: { id: league.id, name: league.name }, ...standings }
})

defineRouteMeta({
  openAPI: {
    tags: ['Matches'],
    summary: 'League standings for a match',
    description:
      "Every member of the given league ranked by the points their pick earns on this one match. Live matches score at the current scoreline (provisional); finished matches use the scored points. Picks are hidden until kickoff (scope 'upcoming', no rows). Members with no locked pick are summarised in notPredicted.",
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        description: 'Internal match id (UUID).',
        schema: { type: 'string' },
      },
      {
        in: 'query',
        name: 'league',
        required: true,
        description: 'League id: rank that league\'s members. Caller must be a member of the league (or an admin).',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: "Ranked member picks with points, plus scope and notPredicted." },
      '400': { description: 'Missing league query parameter.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown league, or a league the caller is not a member of.' },
    },
  },
})
