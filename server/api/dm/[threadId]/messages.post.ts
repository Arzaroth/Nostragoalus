import { z } from 'zod'
import { db } from '../../../../db'
import { postDmMessage } from '../../../utils/dm/service'
import { notifyDm } from '../../../utils/dm/notify'
import { publishDmMessage } from '../../../utils/live/hub'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { emptyReactionTotals } from '../../../../shared/reactions'
import type { DmMessageDTO } from '../../../../shared/types/dm'
import type { ChatMessageDTO } from '../../../../shared/types/chat'

const bodySchema = z.object({
  ciphertext: z.string().min(1).max(16_384),
  epoch: z.number().int().positive(),
  parentId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
  // Optional encrypted webp attachments (base64 ciphertext) and their original
  // sizes, in display order. Several may ride on one message.
  images: z
    .array(z.object({ ciphertext: z.string().min(1).max(9_000_000), byteSize: z.number().int().positive() }))
    .max(6)
    .optional(),
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
    images: body.images ?? null,
  })
  // The HTTP response is the full ChatMessageDTO shape (parity with league chat);
  // the live dm:new frame carries the lighter DmMessageDTO the client expects.
  const message: ChatMessageDTO = {
    id: row.id,
    leagueId: '',
    matchId: null,
    parentId: row.parentId,
    threadId: row.threadId,
    userId: row.userId,
    epoch: row.epoch,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
    editedAt: null,
    attachments: row.attachments,
    moderation: 'VISIBLE',
    reported: false,
    reactions: emptyReactionTotals(),
    myReaction: null,
    threadCount: 0,
  }
  const live: DmMessageDTO = {
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
  void Promise.resolve(publishDmMessage([user.id, row.otherId], live))
  void notifyDm(db, { threadId, messageId: row.id, senderId: user.id, recipientId: row.otherId }).catch(() => {})
  return { message }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Send a direct message',
    description: 'Participant only. Stores ciphertext + optional encrypted images, pushes it live to both participants and notifies the recipient.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ message: ChatMessageDTO }.' },
      '404': { description: 'Not a participant.' },
      '409': { description: 'Stale key epoch.' },
    },
  },
})
