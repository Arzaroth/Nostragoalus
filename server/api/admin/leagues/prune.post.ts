import { db } from '../../../../db'
import { requireAdmin } from '../../../utils/auth-guards'
import { pruneEmptyLeagues } from '../../../utils/leagues/service'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { pruned: await pruneEmptyLeagues(db) }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Admin (internal)"],
    "summary": "Prune empty leagues",
    "description": "Internal: irreversibly deletes every league without a single member (join codes, opt-outs and SSO auto-join links go with them).",
    "responses": {
      "200": { "description": "Number of leagues removed." },
      "401": { "description": "Not signed in." },
      "403": { "description": "Admin session required." }
    }
  },
})
