import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { getRecoveryBlob } from '../../utils/chat/service'

// The caller's recovery escrow blob (ciphertext of their private key, openable
// only with their recovery code) for restoring on a new device. Null if none.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { blob: await getRecoveryBlob(db, user.id) }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'My recovery escrow blob',
    description: "Ciphertext of the caller's private key, decryptable only client-side with their recovery code. Null if not set.",
    responses: { '200': { description: '{ blob: string | null }.' } },
  },
})
