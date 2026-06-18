import { z } from 'zod'
import { db } from '../../../db'
import { setRecoveryBlob } from '../../utils/chat/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({ blob: z.string().min(1).max(4096) })

// Save (or replace) the recovery escrow of the caller's private key. The blob is
// opaque ciphertext the server cannot open.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  await setRecoveryBlob(db, user.id, body.blob)
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Save my recovery escrow',
    description: 'Stores the ciphertext escrow of the private key (requires an existing identity).',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object', properties: { blob: { type: 'string' } }, required: ['blob'] } } },
    },
    responses: { '200': { description: '{ ok: true }.' }, '404': { description: 'No chat identity yet.' } },
  },
})
