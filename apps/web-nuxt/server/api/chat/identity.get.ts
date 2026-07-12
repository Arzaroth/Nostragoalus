import { z } from 'zod'
import { db } from '../../../db'
import { getChatIdentity } from '../../utils/chat/service'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({
  identity: z.object({ publicKey: z.string(), hasRecovery: z.boolean() }).nullable(),
})

// The caller's chat identity (public key only) plus whether they have a recovery
// escrow saved. The private key never lives server-side, so it is never returned.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ user }) => {
  const id = await getChatIdentity(db, user.id)
  return { identity: id ? { publicKey: id.publicKey, hasRecovery: id.recoveryWrappedKey != null } : null }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'My chat identity',
    description: "The caller's chat public key and whether a recovery escrow is saved (null if not enrolled).",
    responses: { '200': { description: '{ identity: { publicKey, hasRecovery } | null }.' } },
  },
})
