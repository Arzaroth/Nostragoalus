import { db } from '../../../../../../db'
import { requireUser } from '../../../../../utils/auth-guards'
import { getAttachmentCiphertext } from '../../../../../utils/chat/attachments'
import { toHttpError } from '../../../../../utils/http'

// One encrypted image on a message (by ?idx=, default 0), fetched on demand when
// it is rendered (kept out of the message list so a room stays light). Members
// only; the ciphertext is decrypted on the client - the server never sees the
// picture. Returns the epoch too so the client picks the right key.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const messageId = getRouterParam(event, 'messageId') as string
  const q = getQuery(event)
  const idx = typeof q.idx === 'string' ? Number(q.idx) : 0
  try {
    return await getAttachmentCiphertext(db, messageId, Number.isFinite(idx) ? idx : 0, user.id)
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
      { in: 'query', name: 'idx', required: false, schema: { type: 'integer' } },
    ],
    responses: {
      '200': { description: '{ ciphertext, epoch }.' },
      '403': { description: 'Not a member.' },
      '404': { description: 'No attachment.' },
    },
  },
})
