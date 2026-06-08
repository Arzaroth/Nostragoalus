import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { getMatchInsights } from '../../../utils/stats/insights'
import { getAllTimeHeadToHead } from '../../../utils/stats/alltime-h2h'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const insights = await getMatchInsights(db, id)
  if (!insights) throw createError({ statusCode: 404, statusMessage: 'match not found' })

  // All-time tally (incl. friendlies/qualifiers) from FIFA's full calendar,
  // from the home side's perspective. Optional enrichment - never blocks.
  let h2hAll = null
  const rows = await db
    .select({ home: match.homeTeamCode, away: match.awayTeamCode })
    .from(match)
    .where(eq(match.id, id))
    .limit(1)
  if (rows[0]?.home && rows[0]?.away) {
    h2hAll = await getAllTimeHeadToHead(rows[0].home, rows[0].away)
  }

  return { ...insights, h2hAll }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match insights",
    "description": "Pre/post-match intelligence: recent form, next matches, head-to-head (within our competitions plus an all-time tally from FIFA's full international calendar, friendlies included), group standings, goals and possession.",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "Internal match id (UUID).",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Insights bundle."
      }
    }
  },
})
