import { z } from 'zod'
import { db } from '../../../../db'
import { defineReadHandler } from '../../../utils/read-handler'
import { listCompetitionOddsProviders } from '../../../utils/odds/provider-config'
import { competitionOddsRowSchema } from '../../../schemas/admin-misc'

// Mirrors OddsProviderList (server/utils/odds/provider-config.ts): the provider
// catalog plus every competition's current provider row.
const responseSchema = z.object({
  providers: z.array(z.object({ key: z.string(), fetchesOdds: z.boolean() })),
  competitions: z.array(competitionOddsRowSchema),
})

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
  return listCompetitionOddsProviders(db)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "List odds providers",
    "description": "Every competition with its current odds provider and event ref, plus the known providers and whether each can fetch odds over HTTP.",
    "responses": {
      "200": {
        "description": "Competitions and the provider catalog."
      },
      "403": {
        "description": "Not an admin."
      }
    }
  },
})
