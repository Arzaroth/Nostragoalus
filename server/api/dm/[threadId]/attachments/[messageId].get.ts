import { db } from '../../../../../db'
import { requireUser } from '../../../../utils/auth-guards'
import { getAttachmentCiphertext } from '../../../../utils/chat/attachments'
import { toHttpError } from '../../../../utils/http'

// One encrypted image on a DM message (by ?idx=, default 0), fetched on demand when
// it is rendered (kept out of the message list so a thread stays light). Participant
// only (getAttachmentCiphertext authorizes); the ciphertext is decrypted on the
// client. Returns the epoch too so the client picks the right key.
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
    tags: ['DM'],
    summary: 'Fetch a DM image attachment',
    description: 'Participant only. Returns the encrypted webp ciphertext for a message, decrypted on the client.',
    parameters: [
      { in: 'path', name: 'threadId', required: true, schema: { type: 'string' } },
      { in: 'path', name: 'messageId', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'idx', required: false, schema: { type: 'integer' } },
    ],
    responses: {
      '200': { description: '{ ciphertext, epoch }.' },
      '404': { description: 'No attachment / not a participant.' },
    },
  },
})
