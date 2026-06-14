import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { listScoringConfigs } from '../../../utils/scoring/admin'

export default defineValidatedHandler({ admin: true }, async () => {
  return listScoringConfigs(db)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "List scoring configs",
    "description": "The default scoring config and every per-competition override, plus the competitions available to override.",
    "responses": {
      "200": {
        "description": "Default config and overrides."
      },
      "403": {
        "description": "Not an admin."
      }
    }
  },
})
