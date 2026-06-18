import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { getChatIdentity } from '../../utils/chat/service'

// The caller's chat identity (public key only) plus whether they have a recovery
// escrow saved. The private key never lives server-side, so it is never returned.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
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
