import { db } from '../../../db'
import { getLeaderboard } from '../../utils/leaderboard/service'
import { getLiveProvisionalPoints } from '../../utils/leaderboard/live'
import { getLeagueRankMovements, getRankMovements } from '../../utils/leaderboard/snapshots'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { getSessionUser, isAdmin, requireUser } from '../../utils/auth-guards'
import { canViewLeague, getLeague, getMembership } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = query.limit ? Math.min(Number(query.limit), 200) : 100
  const offset = query.offset ? Math.max(Number(query.offset), 0) : 0
  // Always keep the signed-in viewer on the board so a hidden/private account
  // (e.g. an admin-hidden one) still sees its own row, even in its own league.
  const viewer = await getSessionUser(event)

  // League-scoped ranking. The league fixes the competition; movement arrows
  // are global-rank deltas and don't translate to within-league positions.
  if (query.league) {
    const user = await requireUser(event)
    const league = await getLeague(db, String(query.league))
    if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
    const membership = await getMembership(db, league.id, user.id)
    const admin = membership ? false : await isAdmin(event)
    if (!canViewLeague(league, membership, admin)) {
      throw createError({ statusCode: 404, statusMessage: 'League not found' })
    }
    const competition = await getCompetitionById(db, league.competitionId)
    if (query.competition && competition && query.competition !== competition.slug) {
      throw createError({ statusCode: 400, statusMessage: 'League belongs to another competition' })
    }
    // League mates see each other even with private profiles; outsiders
    // browsing a public league's board don't.
    const includePrivate = !!membership || admin
    const liveProvisional = await getLiveProvisionalPoints(db, league.competitionId)
    const rows = await getLeaderboard(db, {
      competitionId: league.competitionId,
      leagueId: league.id,
      limit,
      offset,
      includePrivate,
      alwaysIncludeUserId: user.id,
      liveProvisional,
    })
    // Movement only for the full-member view: the outsider board excludes
    // private profiles, so snapshot ranks wouldn't line up with displayed ones.
    const movements = includePrivate ? await getLeagueRankMovements(db, league.id) : new Map<string, number>()
    return {
      competition: competition ? { id: competition.id, slug: competition.slug, name: competition.name } : null,
      league: { id: league.id, name: league.name },
      live: liveProvisional.size > 0,
      rows: rows.map((r) => ({ ...r, movement: movements.get(r.userId) ?? null })),
    }
  }

  // Global ranking across every competition.
  if (query.global === 'true') {
    return { competition: null, rows: await getLeaderboard(db, { competitionId: null, limit, offset, alwaysIncludeUserId: viewer?.id }) }
  }

  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, rows: [] }
  const [liveProvisional, movements] = await Promise.all([
    getLiveProvisionalPoints(db, competition.id),
    getRankMovements(db, competition.id),
  ])
  const rows = await getLeaderboard(db, { competitionId: competition.id, limit, offset, alwaysIncludeUserId: viewer?.id, liveProvisional })
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    live: liveProvisional.size > 0,
    rows: rows.map((r) => ({ ...r, movement: movements.get(r.userId) ?? null })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Leaderboard"
    ],
    "summary": "Rankings",
    "description": "Per-competition or global leaderboard with movement arrows derived from rank snapshots.",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "global",
        "required": false,
        "description": "Set to 1 for the all-competition leaderboard.",
        "schema": {
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "league",
        "required": false,
        "description": "League id: rank only that league's members (members, public leagues, or admins). Movement arrows come from per-league snapshots for members/admins; outsiders viewing a public league get movement null.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Ranked players with points, exact counts and movement."
      },
      "400": {
        "description": "League belongs to another competition than the one requested."
      },
      "401": {
        "description": "League view requires being signed in."
      },
      "404": {
        "description": "Unknown league, or private league the caller is not in."
      }
    }
  },
})
