import { db } from '../../../db'
import { listMatches } from '../../utils/matches/service'
import { resolveCompetition } from '../../utils/competitions/store'
import type { AppStage, MatchStatus } from '../../../shared/types/match'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, matches: [] }

  const matches = await listMatches(db, {
    competitionId: competition.id,
    stage: (query.stage as AppStage) || undefined,
    status: (query.status as MatchStatus) || undefined,
    matchday: query.matchday ? Number(query.matchday) : undefined,
  })

  const now = Date.now()
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    matches: matches.map((m) => ({ ...m, isLocked: new Date(m.kickoffTime).getTime() <= now })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "List fixtures",
    "description": "All fixtures of a competition grouped by round, with scores, status and (when signed in) your predictions.",
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
        "description": "Fixture list."
      }
    }
  },
})
