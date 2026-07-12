import { z } from 'zod'
import { db } from '../../../../db'
import { isAdmin } from '../../../utils/auth-guards'
import { canViewLeague, getLeague, getMembership } from '../../../utils/leagues/service'
import { getLeagueModeBoard } from '../../../utils/leaderboard/modes'
import { getLeagueRankSnapshots, rankMovement } from '../../../utils/leaderboard/snapshots'
import { defineReadHandler } from '../../../utils/read-handler'
import { leagueModeSchema } from '../../../schemas/league'

// Rows carry the base board fields plus the route-computed movement arrow. The
// two shapes (points vs survival) are validated as a union so a wrong-mode row
// can never leak.
const pointsRowSchema = z.object({
  rank: z.number(),
  userId: z.string(),
  displayName: z.string(),
  image: z.string().nullable(),
  points: z.number(),
  livePoints: z.number(),
  exactCount: z.number(),
  outcomeCount: z.number(),
  movement: z.number().nullable(),
})
const survivalRowSchema = z.object({
  rank: z.number(),
  userId: z.string(),
  displayName: z.string(),
  image: z.string().nullable(),
  alive: z.boolean(),
  livesLeft: z.number(),
  survived: z.number(),
  eliminatedRoundLabel: z.string().nullable(),
  movement: z.number().nullable(),
})

const responseSchema = z.object({
  board: z.object({
    kind: z.enum(['points', 'survival']),
    mode: leagueModeSchema,
    live: z.boolean(),
    rows: z.array(z.union([pointsRowSchema, survivalRowSchema])),
  }),
  mode: leagueModeSchema,
  lives: z.number().nullable(),
})

// Read-time board for a moded league (easy/hard points, or hardcore survival).
// NORMAL leagues use the standard leaderboard endpoint instead.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
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
  // Movement arrows from the per-league snapshot (written at finalize). Measured
  // against the live rank while a match is in play, else the settled prev rank.
  const snaps = await getLeagueRankSnapshots(db, id)
  const rows = board.rows.map((r) => ({ ...r, movement: rankMovement(snaps.get(r.userId), r.rank, board.live) }))
  return { board: { ...board, rows }, mode: league.mode, lives: league.lives }
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
