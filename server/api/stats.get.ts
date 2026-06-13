import { db } from '../../db'
import { getPlatformStats } from '../utils/stats/platform'

export default defineEventHandler(async () => {
  return await getPlatformStats(db)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Stats"
    ],
    "summary": "Platform totals",
    "description": "Aggregate, name-free counts (registered players, predictions made) for the public landing page. No personal data.",
    "responses": {
      "200": {
        "description": "Platform totals."
      }
    }
  },
})
