import { eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { scimProvider } from '../../../../../db/schema'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

// Revokes SCIM provisioning for a provider by dropping its connection row: the
// IdP's stored bearer no longer resolves, so provisioning calls 401.
export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const providerId = getRouterParam(event, 'providerId')!
  await db.delete(scimProvider).where(eq(scimProvider.providerId, providerId))
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Revoke a SCIM token',
    description: 'Internal: delete the SCIM connection so the IdP bearer stops working.',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Revoked.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
    },
  },
})
