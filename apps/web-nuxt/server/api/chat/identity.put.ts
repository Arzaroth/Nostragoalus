import { z } from 'zod'
import { db } from '../../../db'
import { registerChatIdentity } from '../../utils/chat/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({ publicKey: z.string().min(1).max(256) })

const responseSchema = z.object({ publicKey: z.string(), created: z.boolean() })

// Publish the caller's chat public key once (silent enrollment). An existing key
// is never overwritten; the response says whether this call created it.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user }) => {
  return registerChatIdentity(db, user.id, body.publicKey)
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Register my chat public key',
    description: 'Publishes the public key once. If one already exists it is returned unchanged (created: false).',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object', properties: { publicKey: { type: 'string' } }, required: ['publicKey'] } } },
    },
    responses: { '200': { description: '{ publicKey, created }.' }, '422': { description: 'Invalid body.' } },
  },
})
