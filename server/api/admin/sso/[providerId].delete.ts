import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { ssoProvider } from '../../../../db/schema'
import { requireAdmin } from '../../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'providerId') as string
  await db.delete(ssoProvider).where(eq(ssoProvider.providerId, id))
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Remove an SSO provider",
    "description": "Internal.",
    "parameters": [
      {
        "in": "path",
        "name": "providerId",
        "required": true,
        "description": "Provider id.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Removed."
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
