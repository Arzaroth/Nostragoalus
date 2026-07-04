import { z } from 'zod'
import { db } from '../../../../db'
import { postDmMessage } from '../../../utils/dm/service'
import { notifyDm } from '../../../utils/dm/notify'
import { publishDmMessage } from '../../../utils/live/hub'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import type { DmMessageDTO } from '../../../../shared/types/dm'

const bodySchema = z.object({
  ciphertext: z.string().min(1).max(16_384),
  epoch: z.number().int().positive(),
  parentId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
})

// Post one encrypted DM (server stores ciphertext only), push it live to both
// participants and notify the recipient (bell + push).
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  const row = await postDmMessage(db, {
    threadId,
    userId: user.id,
    ciphertext: body.ciphertext,
    epoch: body.epoch,
    parentId: body.parentId ?? null,
    threadRootId: body.threadId ?? null,
  })
  const message: DmMessageDTO = {
    id: row.id,
    threadId,
    parentId: row.parentId,
    userId: row.userId,
    epoch: row.epoch,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
    editedAt: null,
    moderation: 'VISIBLE',
  }
  // Fire-and-forget fan-out + notify so a delivery hiccup can't fail the post.
  void Promise.resolve(publishDmMessage([user.id, row.otherId], message))
  void notifyDm(db, { threadId, messageId: row.id, senderId: user.id, recipientId: row.otherId }).catch(() => {})
  return { message }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Send a direct message',
    description: 'Participant only. Stores ciphertext, pushes it live to both participants and notifies the recipient.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ message: DmMessageDTO }.' },
      '404': { description: 'Not a participant.' },
      '409': { description: 'Stale key epoch.' },
    },
  },
})
