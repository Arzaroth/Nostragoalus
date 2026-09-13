import { z } from 'zod'
import { db } from '../../../../db'
import { getMatchPlayerRankings } from '../../../utils/stats/scorers'
import { defineReadHandler } from '../../../utils/read-handler'

const topScorerSchema = z.object({
  playerName: z.string(),
  teamName: z.string(),
  teamCode: z.string().nullable(),
  goals: z.number(),
  assists: z.number().nullable(),
  penalties: z.number().nullable(),
  points: z.number().nullable().optional(),
})
// Zod strips what it does not declare, so omitting `points` here would silently
// drop the whole board on the way out while the server had it in hand.
const responseSchema = z.object({
  scorers: z.array(topScorerSchema),
  assists: z.array(topScorerSchema),
  points: z.array(topScorerSchema).optional(),
})

export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  return getMatchPlayerRankings(db, id)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match player rankings",
    "description": "Top scorers and top assists for the fixture's two teams (every contributor, not the tournament-wide top-N), from stored goal events.",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "Match id.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "{ scorers, assists }, each an array of {playerName, teamName, teamCode, goals, assists}."
      }
    }
  },
})
