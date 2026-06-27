import { z } from 'zod'
import { db } from '../../../../../db'
import { postMessage } from '../../../../utils/chat/service'
import { publishChatMessage } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { emptyReactionTotals } from '../../../../../shared/reactions'
import type { ChatMessageDTO } from '../../../../../shared/types/chat'

const bodySchema = z.object({
  matchId: z.string().uuid().nullable().optional(),
  // parentId = a quoted message (stays in the main list); threadId = the thread
  // root this is a reply IN (kept out of the main list). Distinct relations.
  parentId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
  ciphertext: z.string().min(1).max(16_384),
  epoch: z.number().int().positive(),
  // Optional encrypted webp attachments (base64 ciphertext) and their original
  // sizes, in display order. Several may ride on one message.
  images: z
    .array(z.object({ ciphertext: z.string().min(1).max(9_000_000), byteSize: z.number().int().positive() }))
    .max(6)
    .optional(),
  // Plaintext ids the sender @-mentioned (derived client-side from the cleartext).
  // Relayed on the live push for the unread-mention badge; never stored.
  mentions: z.array(z.string().max(64)).max(64).optional(),
})

// Post one encrypted message (server stores ciphertext only) and push it live to
// the league's connected members.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const row = await postMessage(db, {
    leagueId,
    userId: user.id,
    matchId: body.matchId ?? null,
    parentId: body.parentId ?? null,
    threadId: body.threadId ?? null,
    ciphertext: body.ciphertext,
    epoch: body.epoch,
    images: body.images ?? null,
  })
  const message: ChatMessageDTO = {
    id: row.id,
    leagueId,
    matchId: row.matchId,
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
  // Fire-and-forget fan-out so a delivery hiccup can't fail the post itself.
  void publishChatMessage(db, message, body.mentions ?? []).catch(() => {})
  return { message }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Post a chat message',
    description: 'Members only, chat enabled. Stores ciphertext (league room, or a match thread with matchId) and pushes it live.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ message: ChatMessageDTO }.' }, '403': { description: 'Not a member / disabled.' }, '409': { description: 'Stale epoch.' } },
  },
})
