import { z } from 'zod'
import { db } from '../../../../db'
import { pruneEmptyLeagues } from '../../../utils/leagues/service'
import { defineValidatedHandler } from '../../../utils/validated-handler'

const responseSchema = z.object({ pruned: z.number() })

export default defineValidatedHandler({ admin: true, response: responseSchema }, async () => {
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
