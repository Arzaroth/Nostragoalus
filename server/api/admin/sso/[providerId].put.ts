import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../../db'
import { ssoProvider } from '../../../../db/schema'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { openConfig, sealConfig } from '../../../utils/sso/config'
import { findDomainConflicts, parseDomainList } from '../../../utils/auth/sso-domains'

const responseSchema = z.object({ ok: z.literal(true), providerId: z.string() })

// Edits a registered SSO provider in place. The provider type (OIDC/SAML) and
// providerId are immutable - the providerId is baked into the IdP-side callback
// URL. Secret fields left blank keep their stored value.
export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event }) => {
  const providerId = getRouterParam(event, 'providerId') as string
  const rows = await db.select().from(ssoProvider).where(eq(ssoProvider.providerId, providerId)).limit(1)
  const existing = rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Provider not found' })

  const b = await readBody(event)
  const domains = parseDomainList(b?.domains ?? b?.domain)
  if (!domains) throw createError({ statusCode: 400, statusMessage: 'At least one valid domain is required' })
  const conflicts = await findDomainConflicts(db, providerId, domains)
  if (conflicts.length > 0) {
    throw createError({ statusCode: 400, statusMessage: `Domain(s) already captured by another provider: ${conflicts.join(', ')}` })
  }

  const origin = getRequestURL(event).origin
  // The plugin natively supports several captured domains as a CSV list.
  const nextDomain = domains.join(',')
  const update: Partial<typeof ssoProvider.$inferInsert> = {
    domain: nextDomain,
    displayName: String(b?.name || '').trim() || null,
    // The plugin's own update-provider resets domainVerified when the domain
    // changes; that path is blocked over HTTP (sso-guard-paths), so mirror it
    // here. Otherwise a newly added/changed domain inherits the old DNS proof
    // and becomes trusted for login/account-linking without ever being verified.
    ...(nextDomain !== existing.domain ? { domainVerified: false } : {}),
  }

  if (existing.samlConfig) {
    const current = openConfig(existing.samlConfig)
    const entryPoint = String(b?.entryPoint || current.entryPoint || '')
    const cert = String(b?.cert || current.cert || '')
    if (!entryPoint || !cert) {
      throw createError({ statusCode: 400, statusMessage: 'SAML entryPoint and certificate are required' })
    }
    update.issuer = String(b?.entityId || b?.issuer || existing.issuer)
    update.samlConfig = sealConfig({
      ...current,
      entryPoint,
      cert,
      callbackUrl: `${origin}/api/auth/sso/saml2/callback/${providerId}`,
      audience: b?.audience ? String(b.audience) : current.audience,
      idpMetadata: b?.idpMetadata ? { metadata: String(b.idpMetadata) } : current.idpMetadata,
      issuer: update.issuer,
    })
  } else {
    const current = openConfig(existing.oidcConfig)
    const issuer = String(b?.issuer || existing.issuer).replace(/\/$/, '')
    const clientId = String(b?.clientId || current.clientId || '')
    const clientSecret = String(b?.clientSecret || current.clientSecret || '')
    if (!clientId || !clientSecret) {
      throw createError({ statusCode: 400, statusMessage: 'clientId and clientSecret are required' })
    }
    // Re-resolve the IdP endpoints from the discovery document so an issuer
    // change (or an IdP-side endpoint move) is picked up on save.
    const discoveryUrl = String(b?.discoveryEndpoint || `${issuer}/.well-known/openid-configuration`)
    let doc: Record<string, string>
    try {
      doc = await $fetch<Record<string, string>>(discoveryUrl, { timeout: 10000 })
    } catch {
      throw createError({ statusCode: 400, statusMessage: `Could not fetch OIDC discovery document at ${discoveryUrl}` })
    }
    update.issuer = issuer
    update.oidcConfig = sealConfig({
      ...current,
      clientId,
      clientSecret,
      issuer,
      skipDiscovery: true,
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      userInfoEndpoint: doc.userinfo_endpoint,
      jwksEndpoint: doc.jwks_uri,
      scopes: b?.scopes ? String(b.scopes).split(/[\s,]+/).filter(Boolean) : (current.scopes ?? ['openid', 'email', 'profile']),
      pkce: true,
    })
  }

  await db.update(ssoProvider).set(update).where(eq(ssoProvider.providerId, providerId))
  return { ok: true as const, providerId }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Update an SSO provider',
    description: 'Internal: edit a registered provider. Blank secrets keep their stored value; the provider type and providerId are immutable.',
    parameters: [
      {
        in: 'path',
        name: 'providerId',
        required: true,
        description: 'Provider id.',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'Updated.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown provider.' },
    },
  },
})
