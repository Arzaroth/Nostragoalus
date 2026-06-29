import { requireAdmin } from '../../../utils/auth-guards'
import { toHttpError } from '../../../utils/http'
import { buildSpMetadata } from '../../../utils/auth/sp-metadata'

// SP metadata for a provider that is NOT registered yet: IdP setup usually
// needs the SP descriptor before the IdP side exists, which is before the
// provider can be saved here (chicken and egg). Registered providers also have
// the plugin's public endpoint (/api/auth/sso/saml2/sp/metadata) that IdPs can
// poll; this one is admin-only and works from just the form values. The build
// (validation + XML) lives in a tested util.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  let result
  try {
    result = buildSpMetadata({
      providerId: String(q.providerId ?? ''),
      entityId: q.entityId != null ? String(q.entityId) : undefined,
      origin: getRequestURL(event).origin,
    })
  } catch (error) {
    throw toHttpError(error)
  }
  setHeader(event, 'content-type', 'application/xml')
  setHeader(event, 'content-disposition', `attachment; filename="${result.filename}"`)
  return result.xml
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'SP metadata for an unsaved SAML provider',
    description: 'Internal: generates the SP EntityDescriptor from form values so the IdP side can be configured before the provider is registered.',
    parameters: [
      { in: 'query', name: 'providerId', required: true, description: 'Provider id (form value).', schema: { type: 'string' } },
      { in: 'query', name: 'entityId', required: false, description: 'SP entity id; defaults to the app origin.', schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'SAML SP metadata XML.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
    },
  },
})
