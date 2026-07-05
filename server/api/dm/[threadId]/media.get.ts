import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { listRoomMedia } from '../../../utils/chat/attachments'
import { toHttpError } from '../../../utils/http'
import type { ChatMediaItemDTO } from '../../../../shared/types/chat'

// Every image in one DM thread, newest first, for the media gallery. Participant
// only (service enforces); the ciphertext itself is fetched per image on demand
// and decrypted on the client.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const threadId = getRouterParam(event, 'threadId') as string
  try {
    const rows = await listRoomMedia(db, { threadId, userId: user.id })
    const media: ChatMediaItemDTO[] = rows.map((r) => ({
      messageId: r.messageId,
      idx: r.idx,
      epoch: r.epoch,
      createdAt: r.createdAt.toISOString(),
    }))
    return { media }
  } catch (error) {
    throw toHttpError(error)
  }
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
