import { eq } from 'drizzle-orm'
import { auth } from '../../../../lib/auth'
import { db } from '../../../../db'
import { ssoProvider } from '../../../../db/schema'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { findDomainConflicts, parseDomainList } from '../../../utils/auth/sso-domains'

// Registers an SSO provider (OIDC / Google / SAML). Secrets are envelope-encrypted
// at rest by the adapter wrapper when better-auth persists the config. New
// providers always start as 'draft': the admin tests + verifies before enabling.
export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const b = await readBody(event)
  const providerId = String(b?.providerId || '').trim()
  const domains = parseDomainList(b?.domains ?? b?.domain)
  if (!providerId || !domains) {
    throw createError({ statusCode: 400, statusMessage: 'providerId and at least one valid domain are required' })
  }
  const conflicts = await findDomainConflicts(db, providerId, domains)
  if (conflicts.length > 0) {
    throw createError({ statusCode: 400, statusMessage: `Domain(s) already captured by another provider: ${conflicts.join(', ')}` })
  }
  // The plugin natively supports several captured domains as a CSV list.
  const domain = domains.join(',')

  const origin = getRequestURL(event).origin
  let body: Record<string, unknown>

  if (b.type === 'saml') {
    if (!b.entryPoint || !b.cert) {
      throw createError({ statusCode: 400, statusMessage: 'SAML entryPoint and certificate are required' })
    }
    body = {
      providerId,
      domain,
      issuer: String(b.entityId || b.issuer || origin),
      samlConfig: {
        entryPoint: String(b.entryPoint),
        cert: String(b.cert),
        callbackUrl: `${origin}/api/auth/sso/saml2/callback/${providerId}`,
        audience: b.audience ? String(b.audience) : undefined,
        idpMetadata: b.idpMetadata ? { metadata: String(b.idpMetadata) } : undefined,
        spMetadata: { metadata: '', binding: 'post' },
        wantAssertionsSigned: true,
      },
    }
  } else {
    const issuer = b.type === 'google' ? 'https://accounts.google.com' : String(b.issuer || '').replace(/\/$/, '')
    if (!issuer) throw createError({ statusCode: 400, statusMessage: 'issuer is required' })
    if (!b.clientId || !b.clientSecret) {
      throw createError({ statusCode: 400, statusMessage: 'clientId and clientSecret are required' })
    }
    // Resolve the IdP endpoints here (admin-trusted, server-side) and register with
    // them explicitly, so the plugin doesn't fetch/validate the discovery URL itself.
    const discoveryUrl = String(b.discoveryEndpoint || `${issuer}/.well-known/openid-configuration`)
    let doc: Record<string, string>
    try {
      doc = await $fetch<Record<string, string>>(discoveryUrl, { timeout: 10000 })
    } catch {
      throw createError({ statusCode: 400, statusMessage: `Could not fetch OIDC discovery document at ${discoveryUrl}` })
    }
    body = {
      providerId,
      domain,
      issuer,
      oidcConfig: {
        clientId: String(b.clientId),
        clientSecret: String(b.clientSecret),
        skipDiscovery: true,
        authorizationEndpoint: doc.authorization_endpoint,
        tokenEndpoint: doc.token_endpoint,
        userInfoEndpoint: doc.userinfo_endpoint,
        jwksEndpoint: doc.jwks_uri,
        scopes: b.scopes ? String(b.scopes).split(/[\s,]+/).filter(Boolean) : ['openid', 'email', 'profile'],
        pkce: true,
      },
    }
  }

  try {
    // body is built dynamically per provider type; better-auth's union body type
    // can't be narrowed from Record<string, unknown>, so assert at the call.
    const result = await auth.api.registerSSOProvider({ body: body as never, headers: event.headers })
    // status and displayName are our columns, not plugin fields - written after
    // registration. The provider lands as 'draft' (and the plugin already forces
    // domainVerified false), so it isn't live until the admin tests, verifies and
    // enables it.
    const displayName = String(b?.name || '').trim()
    await db
      .update(ssoProvider)
      .set({ status: 'draft', ...(displayName ? { displayName } : {}) })
      .where(eq(ssoProvider.providerId, providerId))
    return { ok: true, providerId, result }
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: (error as Error)?.message || 'Failed to register provider' })
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Register an SSO provider",
    "description": "Internal: add an OIDC/SAML/Google provider at runtime. Secrets are envelope-encrypted before storage.",
    "responses": {
      "200": {
        "description": "Created provider."
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
