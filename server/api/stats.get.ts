import { z } from 'zod'
import { db } from '../../db'
import { defineReadHandler } from '../utils/read-handler'
import { getPlatformStats } from '../utils/stats/platform'

export const responseSchema = z.object({
  players: z.number().int().nonnegative(),
  predictions: z.number().int().nonnegative(),
})

export default defineReadHandler({ response: responseSchema }, async () => {
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
