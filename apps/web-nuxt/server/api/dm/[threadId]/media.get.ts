import { z } from 'zod'
import { db } from '../../../../db'
import { listRoomMedia } from '../../../utils/chat/attachments'
import { defineReadHandler } from '../../../utils/read-handler'
import type { ChatMediaItemDTO } from '../../../../shared/types/chat'

const responseSchema = z.object({
  media: z.array(z.object({
    messageId: z.string(),
    idx: z.number(),
    epoch: z.number(),
    createdAt: z.string(),
  })),
})

// Every image in one DM thread, newest first, for the media gallery. Participant
// only (service enforces); the ciphertext itself is fetched per image on demand
// and decrypted on the client.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  const rows = await listRoomMedia(db, { threadId, userId: user.id })
  const media: ChatMediaItemDTO[] = rows.map((r) => ({
    messageId: r.messageId,
    idx: r.idx,
    epoch: r.epoch,
    createdAt: r.createdAt.toISOString(),
  }))
  return { media }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'List a DM thread\'s images',
    description: 'Participant only. Image descriptors (messageId, idx, epoch) for the thread, newest first. The ciphertext is fetched per image and decrypted on the client.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ media: ChatMediaItemDTO[] }.' }, '404': { description: 'Not a participant.' } },
  },
})
