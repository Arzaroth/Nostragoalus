import { db } from '../../../../db'
import { getMatchLineups } from '../../../utils/lineups/service'

// Thin: the service resolves the provider line-up, refines positions from
// Sofascore where possible, and persists the result (the match_lineups row is
// the cache - frozen once final, refreshed each minute while pending).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  return { lineups: await getMatchLineups(db, id) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match line-ups",
    "description": "Starting XI and bench per team, with the formation (when the feed ships one) and head coach. Empty (available:false) until the official line-ups drop, about an hour before kickoff. Cached one minute while pending/live, for the process lifetime once finished.",
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
        "description": "Line-ups payload, or null when the provider exposes none."
      }
    }
  },
})
