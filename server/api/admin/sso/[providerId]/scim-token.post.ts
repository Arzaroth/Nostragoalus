import { z } from 'zod'
import { auth } from '../../../../../lib/auth'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { scimProviderId } from '../../../../utils/sso/service'

const responseSchema = z.object({ scimToken: z.string(), baseUrl: z.string() })

// Generates (or rotates) the SCIM bearer token for a provider. The plaintext is
// returned ONCE for the admin to paste into the IdP; only its hash is stored.
// generateSCIMToken is otherwise session-only (any user) - this admin route plus
// the catch-all HTTP block are what keep it admin-surface. The token gets the
// provider's derived SCIM id (the plugin forbids reusing the SSO providerId).
export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event }) => {
  const providerId = getRouterParam(event, 'providerId')!
  const result = await auth.api.generateSCIMToken({ body: { providerId: scimProviderId(providerId) }, headers: event.headers })
  return { scimToken: result.scimToken, baseUrl: `${getRequestURL(event).origin}/api/auth/scim/v2` }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Generate a SCIM token',
    description: 'Internal: mint (or rotate) the SCIM bearer for a provider. Returned once; stored hashed.',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'The SCIM token (shown once) + base URL.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
    },
  },
})
