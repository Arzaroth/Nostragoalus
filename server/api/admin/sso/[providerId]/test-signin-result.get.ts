import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { getTestSignInResult } from '../../../../utils/sso/test-signin'

// Admin-gated read of a finished test sign-in's captured claims (keyed by the
// testId nonce). Returns { result: null } until the popup has reported back.
export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const testId = String(getQuery(event).testId ?? '')
  return { result: testId ? await getTestSignInResult(db, testId) : null }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Read a test sign-in result',
    description: 'Internal: the claims captured by a dry-run OIDC test sign-in.',
    parameters: [
      { in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } },
      { in: 'query', name: 'testId', required: true, description: 'The test sign-in nonce.', schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Captured claims, or null if not ready.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
    },
  },
})
