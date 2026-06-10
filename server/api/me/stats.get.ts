import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { getLeaderboard } from '../../utils/leaderboard/service'
import { getMyStats } from '../../utils/predictions/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  if (!competition) return { stats: null }

  const [board, counters] = await Promise.all([
    // includeHidden/includePrivate: hidden or private users still see their own stats.
    getLeaderboard(db, { competitionId: competition.id, limit: 1000, includeHidden: true, includePrivate: true }),
    getMyStats(db, user.id, competition.id),
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
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Account"
    ],
    "summary": "My stats",
    "description": "Points, rank, exact-score count and joker usage for the signed-in user.",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
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
