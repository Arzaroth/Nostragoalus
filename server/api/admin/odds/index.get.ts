import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { listCompetitionOddsProviders } from '../../../utils/odds/provider-config'

export default defineValidatedHandler({ admin: true }, async () => {
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
