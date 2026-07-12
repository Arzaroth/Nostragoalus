import { z } from 'zod'
import { db } from '../../../../../db'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { verifyDomainDns } from '../../../../utils/sso/service'

// Mirrors DomainVerificationCheck (server/utils/sso/service.ts).
const responseSchema = z.object({
  ok: z.boolean(),
  host: z.string(),
  expected: z.string(),
  found: z.array(z.string()),
})

// Resolves the DNS-TXT record and, on a match, marks the domain verified. Returns
// the expected/found records either way so the UI can show what's still missing.
export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event }) => {
  const providerId = getRouterParam(event, 'providerId')!
  return await verifyDomainDns(db, providerId)
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Verify an SSO provider domain via DNS',
    description: 'Internal: resolve the TXT record and flip domainVerified when it matches.',
    parameters: [{ in: 'path', name: 'providerId', required: true, description: 'Provider id.', schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Verification check result (ok + expected/found records).' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown provider.' },
    },
  },
})
