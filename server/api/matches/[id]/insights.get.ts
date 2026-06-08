import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { getMatchInsights } from '../../../utils/stats/insights'
import { getAllTimeHeadToHead, getTeamRecentResults } from '../../../utils/stats/alltime-h2h'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const insights = await getMatchInsights(db, id)
  if (!insights) throw createError({ statusCode: 404, statusMessage: 'match not found' })

  // All-time tally (incl. friendlies/qualifiers) from FIFA's full calendar,
  // from the home side's perspective. Optional enrichment - never blocks.
  let h2hAll = null
  let formAll = null
  const rows = await db
    .select({ home: match.homeTeamCode, away: match.awayTeamCode, kickoff: match.kickoffTime })
    .from(match)
    .where(eq(match.id, id))
    .limit(1)
  if (rows[0]?.home && rows[0]?.away) {
    const before = new Date(rows[0].kickoff).toISOString()
    const [all, homeForm, awayForm] = await Promise.all([
      getAllTimeHeadToHead(rows[0].home, rows[0].away, fetch, Date.now(), before),
      getTeamRecentResults(rows[0].home, before),
      getTeamRecentResults(rows[0].away, before),
    ])
    h2hAll = all
    formAll = homeForm || awayForm ? { home: homeForm ?? [], away: awayForm ?? [] } : null
  }

  return { ...insights, h2hAll, formAll }
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
