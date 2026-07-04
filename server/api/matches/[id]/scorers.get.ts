import { db } from '../../../../db'
import type { PlayerRankings } from '../../../../shared/types/match'
import { getMatchPlayerRankings } from '../../../utils/stats/scorers'

export default defineEventHandler(async (event): Promise<PlayerRankings> => {
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
