import { z } from 'zod'
import { db } from '../../../../db'
import { setChatReaction, getMessageReactionTotals } from '../../../utils/chat/reactions'
import { publishDmReaction } from '../../../utils/live/hub'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { REACTION_EMOJIS } from '../../../../shared/reactions'

const bodySchema = z.object({
  messageId: z.string().uuid(),
  // null clears the caller's reaction (tap the active emoji to toggle off).
  emoji: z.enum(REACTION_EMOJIS).nullable(),
})

const responseSchema = z.object({ ok: z.literal(true) })

// Set or clear the caller's emoji reaction on a DM message, then push the fresh
// totals to the two participants. Participant only; the emoji is plaintext.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  const ctx = await setChatReaction(db, { messageId: body.messageId, userId: user.id, emoji: body.emoji })
  // This DM route only acts on messages in this thread (a league or another
  // thread's message goes through its own route).
  if (ctx.kind !== 'dm' || ctx.threadId !== threadId) {
    throw createError({ statusCode: 404, statusMessage: 'message not found' })
  }
  const totals = await getMessageReactionTotals(db, body.messageId)
  void Promise.resolve(publishDmReaction([ctx.userAId, ctx.userBId], threadId, body.messageId, totals))
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'React to a direct message',
    description: 'Participant only. Sets the caller emoji reaction on a message (null clears it) and pushes the new totals live to both participants.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ ok: true }.' },
      '404': { description: 'Unknown message/thread.' },
      '422': { description: 'Invalid body.' },
    },
  },
})
