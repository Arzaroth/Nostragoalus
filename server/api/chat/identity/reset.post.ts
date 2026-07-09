import { z } from 'zod'
import { db } from '../../../../db'
import { resetChatIdentity } from '../../../utils/chat/service'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { toHttpError } from '../../../utils/http'

const bodySchema = z.object({ publicKey: z.string().min(1).max(256) })

// Replace the caller's chat identity keypair (hard recovery when both the device key
// and the recovery code are lost). Overwrites the public key, drops the old escrow,
// and purges every group/thread key sealed to the old key so keyholders/peers re-seal.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  try {
    await resetChatIdentity(db, user.id, body.publicKey)
    return { ok: true }
  } catch (err) {
    throw toHttpError(err)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Reset my chat identity',
    description:
      'Replaces the chat keypair with a new public key, appends it to the transparency log, drops the recovery escrow, and deletes every league/DM key sealed to the old key. Requires an existing identity.',
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object', properties: { publicKey: { type: 'string' } }, required: ['publicKey'] } } },
    },
    responses: { '200': { description: '{ ok: true }.' }, '404': { description: 'No chat identity yet.' } },
  },
})
