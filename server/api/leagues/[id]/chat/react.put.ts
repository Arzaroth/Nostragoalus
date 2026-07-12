import { z } from 'zod'
import { db } from '../../../../../db'
import { setChatReaction } from '../../../../utils/chat/reactions'
import { publishChatReaction } from '../../../../utils/live/league-chat'
import { okSchema } from '../../../../schemas/chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'
import { REACTION_EMOJIS } from '../../../../../shared/reactions'

const bodySchema = z.object({
  messageId: z.string().uuid(),
  // null clears the caller's reaction (tap the active emoji to toggle off).
  emoji: z.enum(REACTION_EMOJIS).nullable(),
})

// Set or clear the caller's emoji reaction on a message, then push the fresh
// totals to the league's connected members. Members only; the emoji is plaintext.
export default defineValidatedHandler({ body: bodySchema, response: okSchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const ctx = await setChatReaction(db, { messageId: body.messageId, userId: user.id, emoji: body.emoji })
  // This league route only acts on messages in this league (a DM or another
  // league's message goes through its own route).
  if (ctx.kind !== 'league' || ctx.leagueId !== leagueId) {
    throw createError({ statusCode: 404, statusMessage: 'message not found' })
  }
  void publishChatReaction(db, leagueId, body.messageId).catch(() => {})
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'React to a chat message',
    description: 'Members only. Sets the caller emoji reaction on a message (null clears it) and pushes the new totals live.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ ok: true }.' },
      '403': { description: 'Not a member.' },
      '404': { description: 'Unknown message/league.' },
      '422': { description: 'Invalid body.' },
    },
  },
})
