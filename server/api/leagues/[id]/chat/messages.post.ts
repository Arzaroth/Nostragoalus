import { z } from 'zod'
import { db } from '../../../../../db'
import { postMessage } from '../../../../utils/chat/service'
import { publishChatMessage } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import type { ChatMessageDTO } from '../../../../../shared/types/chat'

const bodySchema = z.object({
  matchId: z.string().uuid().nullable().optional(),
  ciphertext: z.string().min(1).max(16_384),
  epoch: z.number().int().positive(),
})

// Post one encrypted message (server stores ciphertext only) and push it live to
// the league's connected members.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const row = await postMessage(db, {
    leagueId,
    userId: user.id,
    matchId: body.matchId ?? null,
    ciphertext: body.ciphertext,
    epoch: body.epoch,
  })
  const message: ChatMessageDTO = {
    id: row.id,
    leagueId,
    matchId: row.matchId,
    userId: row.userId,
    epoch: row.epoch,
    ciphertext: row.ciphertext,
    createdAt: row.createdAt.toISOString(),
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
