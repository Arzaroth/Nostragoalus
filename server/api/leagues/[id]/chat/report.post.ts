import { z } from 'zod'
import { db } from '../../../../../db'
import { reportMessage } from '../../../../utils/chat/moderation'
import { publishModeration } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({ messageId: z.string().uuid() })

// Report a message. Members only; you cannot report your own. Once enough distinct
// members report it the message auto-flips to PENDING and that is pushed live.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const res = await reportMessage(db, { leagueId, messageId: body.messageId, userId: user.id })
  if (res.state === 'PENDING') void publishModeration(db, leagueId, body.messageId, res.state).catch(() => {})
  return res
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Report a chat message',
    description: 'Members only. Flags a message; enough distinct reports auto-hide it pending moderation.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ state, reports }.' },
      '403': { description: 'Not a member.' },
      '404': { description: 'Unknown message.' },
      '422': { description: 'Own message or invalid body.' },
    },
  },
})
