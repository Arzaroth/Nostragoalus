import { z } from 'zod'
import { db } from '../../../../db'
import { defineReadHandler } from '../../../utils/read-handler'
import { listApiKeys } from '../../../utils/api-keys/service'

// Mirrors ApiKeyView (server/utils/api-keys/service.ts): the mapped, secret-free
// row the admin list renders (timestamps already ISO strings, permissions parsed).
const apiKeyViewSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  enabled: z.boolean().nullable(),
  permissions: z.record(z.string(), z.array(z.string())).nullable(),
  expiresAt: z.string().nullable(),
  lastRequest: z.string().nullable(),
  createdAt: z.string(),
  ownerEmail: z.string().nullable(),
})
const responseSchema = z.object({ apiKeys: z.array(apiKeyViewSchema) })

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
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
