import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { setProviderStatus } from '../../../../utils/sso/service'

const bodySchema = z.object({ status: z.enum(['draft', 'enabled', 'disabled']) })

// Move a provider through its lifecycle. Enabling is gated in the service: it
// needs a passing connection test and a verified (or bypassed) domain, else 409.
export default defineValidatedHandler({ admin: true, body: bodySchema }, async ({ event, body }) => {
  const providerId = getRouterParam(event, 'providerId')!
  await setProviderStatus(db, providerId, body.status)
  return { ok: true, status: body.status }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Set SSO provider status',
    description: 'Internal: move a provider between draft/enabled/disabled. Enabling requires a passing connection test and a verified domain.',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Status updated.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown provider.' },
      '409': { description: 'Not ready to enable (test/domain gate).' },
      '422': { description: 'Invalid body.' },
    },
  },
})
