import { z } from 'zod'
import { db } from '../../../../../db'
import { defineReadHandler } from '../../../../utils/read-handler'
import { getTestSignInResult } from '../../../../utils/sso/test-signin'

const querySchema = z.object({ testId: z.string().optional() })

// Mirrors CapturedClaims (server/utils/sso/test-signin.ts).
const capturedClaimsSchema = z.object({
  rawClaims: z.record(z.string(), z.unknown()),
  mapped: z.object({
    email: z.string().nullable(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  }),
})
const responseSchema = z.object({ result: capturedClaimsSchema.nullable() })

// Admin-gated read of a finished test sign-in's captured claims (keyed by the
// testId nonce). Returns { result: null } until the popup has reported back.
export default defineReadHandler({ response: responseSchema, auth: 'admin', query: querySchema }, async ({ query }) => {
  const testId = query.testId ?? ''
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
