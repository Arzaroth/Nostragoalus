import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { scimProvider, ssoProvider } from '../../../../db/schema'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { scimProviderId } from '../../../utils/sso/service'
import { okSchema } from '../../../schemas/admin-sso'

export default defineValidatedHandler({ admin: true, response: okSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'providerId') as string
  await db.delete(ssoProvider).where(eq(ssoProvider.providerId, id))
  // No FK from scim_provider, so drop the provisioning row by hand to avoid an
  // orphaned (and still-valid) SCIM token.
  await db.delete(scimProvider).where(eq(scimProvider.providerId, scimProviderId(id)))
  return { ok: true as const }
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
