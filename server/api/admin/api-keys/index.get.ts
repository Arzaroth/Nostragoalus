import { db } from '../../../../db'
import { requireAdmin } from '../../../utils/auth-guards'
import { listApiKeys } from '../../../utils/api-keys/service'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { apiKeys: await listApiKeys(db) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "List API keys",
    "description": "Internal: every API key across all owners (newest first) with name, scopes, masked start, expiry, last use and owner email. The secret is never returned.",
    "responses": {
      "200": {
        "description": "API key metadata rows."
      },
      "401": {
        "description": "Not signed in."
      },
      "403": {
        "description": "Admin session required."
      }
    }
  },
})
