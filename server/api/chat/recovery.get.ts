import { z } from 'zod'
import { db } from '../../../db'
import { getRecoveryBlob } from '../../utils/chat/service'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({ blob: z.string().nullable() })

// The caller's recovery escrow blob (ciphertext of their private key, openable
// only with their recovery code) for restoring on a new device. Null if none.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ user }) => {
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
