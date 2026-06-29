import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { bypassDomainVerification } from '../../../../utils/sso/service'

// Admin escape hatch: mark the domain verified without the DNS proof. Safe in the
// single-tenant model where the registering admin is already fully trusted.
export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const providerId = getRouterParam(event, 'providerId')!
  await bypassDomainVerification(db, providerId)
  return { ok: true, domainVerified: true }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Bypass SSO domain verification',
    description: 'Internal: mark the provider domain verified without DNS proof (admin-trusted, single-tenant).',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Domain marked verified.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown provider.' },
    },
  },
})
