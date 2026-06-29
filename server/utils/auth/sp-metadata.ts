import { ValidationError } from '../errors'

// providerId becomes part of a filename and the ACS URL path, so keep it to a
// strict charset (no quotes/slashes/spaces) - this is also what stops it being
// used to break out of the XML attribute or the callback path.
const PROVIDER_ID_RE = /^[a-zA-Z0-9_-]+$/

function xmlEscape(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Build the SP EntityDescriptor for a SAML provider that may not be registered
// yet (the IdP side often needs the SP descriptor before the provider can be
// saved here). Pure - no event/DB - so the providerId validation and the XML
// escaping, both of which guard the SAML metadata against injection, are
// testable on their own. Throws ValidationError on a bad providerId.
export function buildSpMetadata(opts: { providerId: string; entityId?: string; origin: string }): {
  filename: string
  xml: string
} {
  const providerId = opts.providerId.trim()
  if (!PROVIDER_ID_RE.test(providerId)) throw new ValidationError('A valid providerId is required')
  const entityId = (opts.entityId ?? '').trim() || opts.origin
  const acs = `${opts.origin}/api/auth/sso/saml2/callback/${providerId}`
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${xmlEscape(entityId)}">
  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${xmlEscape(acs)}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>
`
  return { filename: `nostragoalus-sp-${providerId}.xml`, xml }
}
