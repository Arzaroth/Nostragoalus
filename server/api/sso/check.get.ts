import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { ssoProvider } from '../../../db/schema'
import { domainOfEmail, resolveSsoProviderId } from '../../utils/auth/sso-domains'
import { defineReadHandler } from '../../utils/read-handler'

// Tolerant: a missing/blank email is not a 422, it just resolves to no provider.
const querySchema = z.object({ email: z.string().optional() })
const responseSchema = z.object({ providerId: z.string().nullable(), name: z.string().nullable() })

// Domain capture for the login/signup pages: given an email, says which SSO
// provider (if any) owns its domain so the client can redirect to the IdP (or
// warn before a password signup). Only the id and display name leave the server.
export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ query }) => {
  const email = query.email ?? ''
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
