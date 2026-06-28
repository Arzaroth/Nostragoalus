import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { getMatchLeagueStandings } from '../../../utils/leaderboard/match'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { resolveLeagueView } from '../../../utils/leagues/service'
import { toHttpError } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const matchId = getRouterParam(event, 'id') as string
  const query = getQuery(event)
  const user = await requireUser(event)

  // No league: the public per-match ranking - every visible user who picked
  // (private/hidden excluded, picks still hidden until kickoff). Any signed-in
  // user may read it, so no membership check; private picks stay out via the
  // default visibility filter (includePrivate omitted).
  if (!query.league) {
    const [m] = await db.select({ competitionId: match.competitionId }).from(match).where(eq(match.id, matchId)).limit(1)
    if (!m) return { scope: 'upcoming', rows: [], notPredicted: 0 }
    return getMatchLeagueStandings(db, { matchId, competitionId: m.competitionId, viewerId: user.id })
  }

  // Members/admins only: this exposes each member's per-match pick, the same
  // sensitivity the crowd endpoint and the WS league channel restrict. A public
  // league's board would otherwise leak individual picks to any outsider.
  let resolved
  try {
    resolved = await resolveLeagueView(db, String(query.league), user.id, {
      membersOnly: true,
      resolveAdmin: () => isAdmin(event),
    })
  } catch (error) {
    throw toHttpError(error)
  }
  const { league } = resolved

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
    summary: 'Standings for a match',
    description:
      "Picks ranked by the points they earn on this one match. With ?league, that league's members (members/admins only). Without it, every visible user who picked (private/hidden excluded) - the public ranking. Live matches score at the current scoreline (provisional); finished matches use the scored points. Picks are hidden until kickoff (scope 'upcoming', no rows). League members with no locked pick are summarised in notPredicted.",
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
        required: false,
        description: 'Optional league id: rank that league\'s members (caller must be a member or an admin). Omit to rank every visible user who picked.',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: "Ranked picks with points, plus scope and notPredicted." },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown league, or a league the caller is not a member of.' },
    },
  },
})
