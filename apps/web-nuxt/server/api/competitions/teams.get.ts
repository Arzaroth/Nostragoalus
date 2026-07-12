import { z } from 'zod'
import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { listCompetitionTeams } from '../../utils/champion/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })
const responseSchema = z.object({
  teams: z.array(z.object({ code: z.string(), name: z.string() })),
})

export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) return { teams: [] }
  return { teams: await listCompetitionTeams(db, competition.id) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "List teams",
    "description": "Every team that appears in the competition fixtures, with codes for flags and map placement.",
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
        "description": "Team list."
      }
    }
  },
})
