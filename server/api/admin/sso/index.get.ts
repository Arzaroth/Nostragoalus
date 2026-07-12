import { z } from 'zod'
import { db } from '../../../../db'
import { scimProvider, ssoProvider } from '../../../../db/schema'
import { listProviderAutoJoinLeagues } from '../../../utils/leagues/service'
import { scimProviderId } from '../../../utils/sso/service'
import { defineReadHandler } from '../../../utils/read-handler'

const responseSchema = z.object({
  providers: z.array(
    z.object({
      providerId: z.string(),
      issuer: z.string(),
      name: z.string().nullable(),
      domains: z.array(z.string()),
      type: z.enum(['saml', 'oidc']),
      autoJoinLeagueIds: z.array(z.string()),
      status: z.string(),
      domainVerified: z.boolean(),
      lastTestedAt: z.date().nullable(),
      lastTestOk: z.boolean().nullable(),
      scimEnabled: z.boolean(),
    }),
  ),
})

// Lists registered SSO providers without exposing the (encrypted) config.
export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
  const scimRows = await db.select({ providerId: scimProvider.providerId }).from(scimProvider)
  const scimEnabled = new Set(scimRows.map((r) => r.providerId))
  const rows = await db
    .select({
      providerId: ssoProvider.providerId,
      issuer: ssoProvider.issuer,
      domain: ssoProvider.domain,
      displayName: ssoProvider.displayName,
      saml: ssoProvider.samlConfig,
      status: ssoProvider.status,
      domainVerified: ssoProvider.domainVerified,
      lastTestedAt: ssoProvider.lastTestedAt,
      lastTestResult: ssoProvider.lastTestResult,
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
      status: r.status,
      domainVerified: r.domainVerified,
      lastTestedAt: r.lastTestedAt,
      // Surface only the boolean outcome here; the full per-check detail comes
      // back from the test-connection endpoint when the admin runs it.
      lastTestOk: r.lastTestResult?.ok ?? null,
      scimEnabled: scimEnabled.has(scimProviderId(r.providerId)),
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
