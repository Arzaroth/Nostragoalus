import { db } from '../../../db'
import { countLeagueMembersHiddenFromBoard, getLeaderboard } from '../../utils/leaderboard/service'
import { getLiveProvisionalPoints } from '../../utils/leaderboard/live'
import { getLeagueRankSnapshots, getRankSnapshots, rankMovement, type RankSnapshot } from '../../utils/leaderboard/snapshots'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { isAdmin, requireUser, requireUserOrApiKey } from '../../utils/auth-guards'
import { canViewLeague, getLeague, getMembership } from '../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = query.limit ? Math.min(Number(query.limit), 200) : 100
  const offset = query.offset ? Math.max(Number(query.offset), 0) : 0
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
    const snapshots = includePrivate ? await getLeagueRankSnapshots(db, league.id) : new Map<string, RankSnapshot>()
    const live = liveProvisional.size > 0
    const hiddenCount = await countLeagueMembersHiddenFromBoard(db, {
      leagueId: league.id,
      includePrivate,
      viewerId: user.id,
    })
    return {
      competition: competition ? { id: competition.id, slug: competition.slug, name: competition.name } : null,
      league: { id: league.id, name: league.name },
      live,
      hiddenCount,
      rows: rows.map((r) => ({ ...r, movement: rankMovement(snapshots.get(r.userId), r.rank, live) })),
    }
  }

  // The non-league board ranks every visible player, so it must not be
  // world-readable: require a session or a leaderboard:read key. App pages are
  // already behind auth, so this only turns away anonymous direct API hits. The
  // principal is also kept on the board (alwaysIncludeUserId) so a hidden/private
  // account still sees its own row.
  const principal = await requireUserOrApiKey(event, { leaderboard: ['read'] })

  // Global ranking across every competition.
  if (query.global === 'true') {
    return { competition: null, rows: await getLeaderboard(db, { competitionId: null, limit, offset, alwaysIncludeUserId: principal.id }) }
  }

  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, rows: [] }
  const [liveProvisional, snapshots] = await Promise.all([
    getLiveProvisionalPoints(db, competition.id),
    getRankSnapshots(db, competition.id),
  ])
  const rows = await getLeaderboard(db, { competitionId: competition.id, limit, offset, alwaysIncludeUserId: principal.id, liveProvisional })
  const live = liveProvisional.size > 0
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    live,
    rows: rows.map((r) => ({ ...r, movement: rankMovement(snapshots.get(r.userId), r.rank, live) })),
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
