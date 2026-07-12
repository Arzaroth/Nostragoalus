import { z } from 'zod'
import { db } from '../../../../../db'
import { getAttachmentCiphertext } from '../../../../utils/chat/attachments'
import { defineReadHandler } from '../../../../utils/read-handler'

const querySchema = z.object({ idx: z.string().optional() })
const responseSchema = z.object({ ciphertext: z.string(), epoch: z.number() })

// One encrypted image on a DM message (by ?idx=, default 0), fetched on demand when
// it is rendered (kept out of the message list so a thread stays light). Participant
// only (getAttachmentCiphertext authorizes); the ciphertext is decrypted on the
// client. Returns the epoch too so the client picks the right key.
export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ event, user, query }) => {
  const messageId = getRouterParam(event, 'messageId') as string
  const idx = typeof query.idx === 'string' ? Number(query.idx) : 0
  return await getAttachmentCiphertext(db, messageId, Number.isFinite(idx) ? idx : 0, user.id)
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
