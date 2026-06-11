import { db } from '../../../db'
import { isAdmin, requireUser } from '../../utils/auth-guards'
import { getCompetitionById, resolveCompetition } from '../../utils/competitions/store'
import { getLeaderboard } from '../../utils/leaderboard/service'
import { canViewLeague, getLeague, getMembership } from '../../utils/leagues/service'
import { getMyStats } from '../../utils/predictions/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)

  // League scope: rank/players are within that league (members see private
  // mates); the caller's own counters stay competition-wide.
  if (query.league) {
    const league = await getLeague(db, String(query.league))
    if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
    const membership = await getMembership(db, league.id, user.id)
    const admin = membership ? false : await isAdmin(event)
    if (!canViewLeague(league, membership, admin)) throw createError({ statusCode: 404, statusMessage: 'League not found' })
    const competition = await getCompetitionById(db, league.competitionId)
    if (!competition) return { stats: null }
    const [board, counters] = await Promise.all([
      getLeaderboard(db, { competitionId: league.competitionId, leagueId: league.id, includePrivate: !!membership || admin, limit: 10000, alwaysIncludeUserId: user.id }),
      getMyStats(db, user.id, league.competitionId),
    ])
    const row = board.find((r) => r.userId === user.id)
    return {
      stats: {
        rank: row?.rank ?? null,
        players: board.length,
        totalPoints: row?.totalPoints ?? 0,
        exact: row?.exactCount ?? 0,
        outcome: row?.outcomeCount ?? 0,
        predictions: counters.predictions,
        jokers: counters.jokers,
      },
    }
  }

  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { stats: null }

  const [board, counters] = await Promise.all([
    // Rank the caller against the SAME population the visible board shows
    // (other hidden/private users excluded), but always keep the caller on it
    // so they see their own rank and points even if they went private.
    getLeaderboard(db, { competitionId: competition.id, limit: 1000, alwaysIncludeUserId: user.id }),
    getMyStats(db, user.id, competition.id),
  ])
  const row = board.find((r) => r.userId === user.id)
  // A private/hidden caller occupies no public position; null reads as "-".
  const isExcluded = (user as { profilePrivate?: boolean; hiddenFromLeaderboard?: boolean }).profilePrivate === true || (user as { hiddenFromLeaderboard?: boolean }).hiddenFromLeaderboard === true
  return {
    stats: {
      rank: isExcluded ? null : (row?.rank ?? null),
      players: board.length - (isExcluded ? 1 : 0),
      totalPoints: row?.totalPoints ?? 0,
      exact: row?.exactCount ?? 0,
      outcome: row?.outcomeCount ?? 0,
      predictions: counters.predictions,
      jokers: counters.jokers,
    },
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Account"
    ],
    "summary": "My stats",
    "description": "Points, rank, exact-score count and joker usage for the signed-in user. With ?league=, rank and player count are scoped to that league.",
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
        "name": "league",
        "required": false,
        "description": "League id: rank and player count over that league's members.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Personal stats."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
