import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { testConnection } from '../../../../utils/sso/service'

// Runs the automated pre-flight checks (OIDC discovery/JWKS, SAML cert/entry
// point) and persists the outcome. A passing result is the gate to enable.
export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const providerId = getRouterParam(event, 'providerId')!
  return await testConnection(db, providerId)
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Test an SSO provider connection',
    description: 'Internal: run automated reachability/config checks and store the result on the provider.',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Test result (ok + per-check details).' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown provider.' },
    },
  },
})
