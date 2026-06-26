import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { providerForCompetition } from '../../utils/providers'
import { resolveCompetition } from '../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { getCompetitionTopScorers } from '../../utils/stats/scorers'
import { goalEvent } from '../../../db/schema'

const cache = new Map<string, { at: number; scorers: unknown[] }>()
const TTL_MS = 10 * 60 * 1000

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { scorers: [] }

  const cached = cache.get(competition.id)
  if (cached && Date.now() - cached.at < TTL_MS) return { scorers: cached.scorers }

  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))

  // Official FIFA player stats (goals + assists), keyless - needs any team id seen this season.
  if (provider.getPlayerStats) {
    const teamRow = await db
      .select({ teamId: goalEvent.teamId })
      .from(goalEvent)
      .where(eq(goalEvent.competitionId, competition.id))
      .limit(1)
    const teamId = teamRow[0]?.teamId
    if (teamId) {
      try {
        const scorers = await provider.getPlayerStats({ teamId })
        // FIFA hasn't published aggregated player stats for an in-progress edition
        // (the array comes back empty); fall through to the local goal-event
        // aggregation rather than blanking the rankings.
        if (scorers.length > 0) {
          cache.set(competition.id, { at: Date.now(), scorers })
          return { scorers }
        }
      } catch {
        // fall through to local / football-data
      }
    }
  }

  // Local goal-event aggregation (goals only).
  const local = await getCompetitionTopScorers(db, competition.id)
  if (local.length > 0) return { scorers: local }

  // A provider that exposes scorers directly (e.g. football-data).
  if (provider.getTopScorers) {
    try {
      const scorers = await provider.getTopScorers({ season: competition.seasonHint ?? '' })
      cache.set(competition.id, { at: Date.now(), scorers })
      return { scorers }
    } catch {
      return { scorers: [] }
    }
  }

  return { scorers: [] }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "Player rankings",
    "description": "Per-player goals and assists for the competition, from official sources (FIFA player stats or UEFA rankings).",
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
        "description": "Array of {playerName, teamName, teamCode, goals, assists}."
      }
    }
  },
})
