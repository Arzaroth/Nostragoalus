import { db } from '../../../../db'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { canViewLeague, getLeague, getMembership } from '../../../utils/leagues/service'
import { getLeagueModeBoard } from '../../../utils/leaderboard/modes'

// Read-time board for a moded league (easy/hard points, or hardcore survival).
// NORMAL leagues use the standard leaderboard endpoint instead.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const league = await getLeague(db, id)
  if (!league) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  const membership = await getMembership(db, id, user.id)
  const admin = membership ? false : await isAdmin(event)
  // Private leagues 404 (not 403) for outsiders so ids never leak existence.
  if (!canViewLeague(league, membership, admin)) throw createError({ statusCode: 404, statusMessage: 'League not found' })
  if (league.mode === 'NORMAL') throw createError({ statusCode: 400, statusMessage: 'Not a moded league' })

  const includePrivate = !!membership || admin
  const board = await getLeagueModeBoard(db, {
    leagueId: id,
    mode: league.mode,
    competitionId: league.competitionId,
    lives: league.lives,
    includePrivate,
    alwaysIncludeUserId: user.id,
  })
  return { board, mode: league.mode, lives: league.lives }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Moded league board",
    "description": "Points board (easy/hard) or survival board (hardcore), re-scored from members' effective picks. 400 for a NORMAL league - use the standard leaderboard instead.",
    "responses": {
      "200": { "description": "The mode board (kind = points | survival)." },
      "400": { "description": "League is NORMAL." },
      "401": { "description": "Not signed in." },
      "404": { "description": "Unknown or hidden league." }
    }
  },
})
