import { requireAdmin } from '../../../utils/auth-guards'

function xmlEscape(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// SP metadata for a provider that is NOT registered yet: IdP setup usually
// needs the SP descriptor before the IdP side exists, which is before the
// provider can be saved here (chicken and egg). Registered providers also have
// the plugin's public endpoint (/api/auth/sso/saml2/sp/metadata) that IdPs can
// poll; this one is admin-only and works from just the form values.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = getQuery(event)
  const providerId = String(q.providerId ?? '').trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(providerId)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid providerId is required' })
  }
  const origin = getRequestURL(event).origin
  const entityId = String(q.entityId ?? '').trim() || origin
  const acs = `${origin}/api/auth/sso/saml2/callback/${providerId}`

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${xmlEscape(entityId)}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${xmlEscape(acs)}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>
`
  setHeader(event, 'content-type', 'application/xml')
  setHeader(event, 'content-disposition', `attachment; filename="nostragoalus-sp-${providerId}.xml"`)
  return xml
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
