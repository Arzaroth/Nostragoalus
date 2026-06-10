import { db } from '../../../../db'
import { ssoProvider } from '../../../../db/schema'
import { requireAdmin } from '../../../utils/auth-guards'
import { listProviderAutoJoinLeagues } from '../../../utils/leagues/service'

// Lists registered SSO providers without exposing the (encrypted) config.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await db
    .select({
      providerId: ssoProvider.providerId,
      issuer: ssoProvider.issuer,
      domain: ssoProvider.domain,
      displayName: ssoProvider.displayName,
      saml: ssoProvider.samlConfig,
    })
    .from(ssoProvider)
  const autoJoin = await listProviderAutoJoinLeagues(db)
  return {
    providers: rows.map((r) => ({
      providerId: r.providerId,
      issuer: r.issuer,
      name: r.displayName,
      // The domain column natively holds a CSV list of captured domains.
      domains: r.domain.split(',').map((d) => d.trim()).filter(Boolean),
      type: r.saml ? ('saml' as const) : ('oidc' as const),
      autoJoinLeagueIds: autoJoin.get(r.providerId) ?? [],
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
