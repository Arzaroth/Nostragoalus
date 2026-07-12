import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { startTestSignIn } from '../../../../utils/sso/test-signin'

// Mirrors TestSignInStart (server/utils/sso/test-signin.ts).
const responseSchema = z.object({ testId: z.string(), url: z.string() })

// Starts an OIDC dry-run: returns the IdP authorization URL the admin opens in a
// popup. The popup posts the result back, which the page reads via the result
// route. No user/session is ever created.
export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event, user }) => {
  const providerId = getRouterParam(event, 'providerId')!
  const origin = getRequestURL(event).origin
  return await startTestSignIn(db, providerId, user.id, origin)
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Start an OIDC test sign-in',
    description: 'Internal: build the authorization URL for a dry-run claim preview (OIDC only).',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'testId + authorization URL.' },
      '400': { description: 'Provider is not OIDC or is misconfigured.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown provider.' },
    },
  },
})
