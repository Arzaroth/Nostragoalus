import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { getDomainVerificationInstructions } from '../../../../utils/sso/service'

// Returns the DNS-TXT record to publish on the first configured domain (minting a
// 7-day token if needed) plus whether the domain is already verified.
export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const providerId = getRouterParam(event, 'providerId')!
  return await getDomainVerificationInstructions(db, providerId)
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Get domain verification instructions',
    description: 'Internal: the TXT host/value to publish for DNS domain verification.',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'TXT record host/value + verified flag.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown provider.' },
    },
  },
})
