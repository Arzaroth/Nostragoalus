import { z } from 'zod'
import { db } from '../../../../../db'
import { enableLeagueChat } from '../../../../utils/chat/service'
import { publishStateChanged } from '../../../../utils/live/league-chat'
import { epochResultSchema } from '../../../../schemas/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({
  // The group key sealed to each current member's public key (computed client-side).
  wraps: z.array(z.object({ userId: z.string(), wrappedKey: z.string().min(1).max(1024) })).max(2000),
})

// Enable chat (OWNER/MODERATOR). The client confirmed the legal warning, generated
// the group key, and supplies the per-member wraps; the server only persists them.
export default defineValidatedHandler({ body: bodySchema, response: epochResultSchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const res = await enableLeagueChat(db, { leagueId, actorId: user.id, wraps: body.wraps })
  void publishStateChanged(db, leagueId).catch(() => {})
  return res
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Enable league chat',
    description: 'OWNER/MODERATOR only. Bumps the key epoch and stores the sealed group key per member.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ epoch }.' }, '403': { description: 'Not an admin.' }, '409': { description: 'Already enabled.' } },
  },
})
