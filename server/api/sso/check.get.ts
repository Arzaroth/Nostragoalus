import { db } from '../../../db'
import { domainOfEmail, resolveSsoProviderId } from '../../utils/auth/sso-domains'

// Domain capture for the login page: given an email, says which SSO provider
// (if any) owns its domain so the client can redirect to the IdP instead of
// asking for a password. Only the providerId ever leaves the server.
export default defineEventHandler(async (event) => {
  const email = String(getQuery(event).email ?? '')
  const domain = domainOfEmail(email)
  const providerId = domain ? await resolveSsoProviderId(db, domain) : null
  return { providerId }
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
