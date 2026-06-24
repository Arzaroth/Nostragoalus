import { z } from 'zod'
import { db } from '../../../../../db'
import { moderateMessage } from '../../../../utils/chat/moderation'
import { publishModeration } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({
  messageId: z.string().uuid(),
  // remove = tombstone the message; restore = dismiss the reports and reveal it.
  action: z.enum(['remove', 'restore']),
})

// Owner/moderator rules on a reported message, then pushes the new state live.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const res = await moderateMessage(db, { leagueId, messageId: body.messageId, actorId: user.id, action: body.action })
  void publishModeration(db, leagueId, body.messageId, res.state).catch(() => {})
  return res
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Moderate a chat message',
    description: 'OWNER/MODERATOR only. Removes (tombstones) or restores a message and pushes the change live.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ state }.' },
      '403': { description: 'Not a moderator.' },
      '404': { description: 'Unknown message.' },
    },
  },
})
