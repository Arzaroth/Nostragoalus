import { db } from '../../../../db'
import { ssoProvider } from '../../../../db/schema'
import { requireAdmin } from '../../../utils/auth-guards'

// Lists registered SSO providers without exposing the (encrypted) config.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await db
    .select({
      providerId: ssoProvider.providerId,
      issuer: ssoProvider.issuer,
      domain: ssoProvider.domain,
      saml: ssoProvider.samlConfig,
    })
    .from(ssoProvider)
  return {
    providers: rows.map((r) => ({
      providerId: r.providerId,
      issuer: r.issuer,
      domain: r.domain,
      type: r.saml ? 'saml' : 'oidc',
    })),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "List SSO providers",
    "description": "Internal: registered SSO providers (secrets stay encrypted at rest).",
    "responses": {
      "200": {
        "description": "Provider list."
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
