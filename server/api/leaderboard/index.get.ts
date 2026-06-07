import { db } from '../../../db'
import { getLeaderboard } from '../../utils/leaderboard/service'
import { getRankMovements } from '../../utils/leaderboard/snapshots'
import { resolveCompetition } from '../../utils/competitions/store'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = query.limit ? Math.min(Number(query.limit), 200) : 100
  const offset = query.offset ? Math.max(Number(query.offset), 0) : 0

  // Global ranking across every competition.
  if (query.global === 'true') {
    return { competition: null, rows: await getLeaderboard(db, { competitionId: null, limit, offset }) }
  }

  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, rows: [] }
  const [rows, movements] = await Promise.all([
    getLeaderboard(db, { competitionId: competition.id, limit, offset }),
    getRankMovements(db, competition.id),
  ])
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
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
      }
    ],
    "responses": {
      "200": {
        "description": "Ranked players with points, exact counts and movement."
      }
    }
  },
})
