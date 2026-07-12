import { z } from 'zod'
import { db } from '../../../../db'
import { chatMessageSchema } from '../../../schemas/dm'
import { postDmMessage } from '../../../utils/dm/service'
import { notifyDm } from '../../../utils/dm/notify'
import { publishDmMessage } from '../../../utils/live/hub'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { emptyReactionTotals } from '../../../../shared/reactions'
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

const responseSchema = z.object({ message: chatMessageSchema })

// Post one encrypted DM (server stores ciphertext only), push it live to both
// participants and notify the recipient (bell + push).
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
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
  // The HTTP response and the live dm:new frame are the SAME ChatMessageDTO (parity
  // with league chat), so the recipient decrypts it exactly like a loaded row - its
  // threadId is the reply-root (null at top level) and attachments render live.
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
  // Fire-and-forget fan-out + notify so a delivery hiccup can't fail the post. The
  // conversation threadId is the frame's routing key; the message carries the rest.
  void Promise.resolve(publishDmMessage([user.id, row.otherId], threadId, message))
  void notifyDm(db, { threadId, senderId: user.id, recipientId: row.otherId }).catch(() => {})
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
