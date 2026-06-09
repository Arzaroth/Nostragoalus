import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { ssoProvider } from '../../../db/schema'
import { domainOfEmail, resolveSsoProviderId } from '../../utils/auth/sso-domains'

// Domain capture for the login/signup pages: given an email, says which SSO
// provider (if any) owns its domain so the client can redirect to the IdP (or
// warn before a password signup). Only the id and display name leave the server.
export default defineEventHandler(async (event) => {
  const email = String(getQuery(event).email ?? '')
  const domain = domainOfEmail(email)
  const providerId = domain ? await resolveSsoProviderId(db, domain) : null
  if (!providerId) return { providerId: null, name: null }
  const rows = await db
    .select({ displayName: ssoProvider.displayName })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1)
  return { providerId, name: rows[0]?.displayName ?? providerId }
})

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Resolve the SSO provider for an email domain',
    description: 'Returns the providerId capturing the email domain, or null when password login applies.',
    parameters: [
      {
        in: 'query',
        name: 'email',
        required: true,
        description: 'Email address to check.',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'providerId or null.' },
    },
  },
})
