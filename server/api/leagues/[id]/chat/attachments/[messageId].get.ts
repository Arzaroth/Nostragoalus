import { db } from '../../../../../../db'
import { requireUser } from '../../../../../utils/auth-guards'
import { getAttachmentCiphertext } from '../../../../../utils/chat/attachments'
import { toHttpError } from '../../../../../utils/http'

// The encrypted image for one message, fetched on demand when it is rendered
// (kept out of the message list so a room stays light). Members only; the
// ciphertext is decrypted on the client - the server never sees the picture.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const messageId = getRouterParam(event, 'messageId') as string
  try {
    return { ciphertext: await getAttachmentCiphertext(db, messageId, user.id) }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Fetch a chat image attachment',
    description: 'Members only. Returns the encrypted webp ciphertext for a message, decrypted on the client.',
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
      { in: 'path', name: 'messageId', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: '{ ciphertext }.' },
      '403': { description: 'Not a member.' },
      '404': { description: 'No attachment.' },
    },
  },
})
