import { z } from 'zod'
import { db } from '../../../../../db'
import { postMessage } from '../../../../utils/chat/service'
import { publishChatMessage } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { emptyReactionTotals } from '../../../../../shared/reactions'
import type { ChatMessageDTO } from '../../../../../shared/types/chat'

const bodySchema = z.object({
  matchId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  ciphertext: z.string().min(1).max(16_384),
  epoch: z.number().int().positive(),
  // Optional encrypted webp attachment (base64 ciphertext) and its original size.
  image: z.object({ ciphertext: z.string().min(1).max(9_000_000), byteSize: z.number().int().positive() }).nullable().optional(),
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
    ciphertext: body.ciphertext,
    epoch: body.epoch,
    image: body.image ?? null,
  })
  const message: ChatMessageDTO = {
    id: row.id,
    leagueId,
    matchId: row.matchId,
    parentId: row.parentId,
    userId: row.userId,
    epoch: row.epoch,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
    hasAttachment: row.hasAttachment,
    moderation: 'VISIBLE',
    reported: false,
    reactions: emptyReactionTotals(),
    myReaction: null,
  }
  // Fire-and-forget fan-out so a delivery hiccup can't fail the post itself.
  void publishChatMessage(db, message).catch(() => {})
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
