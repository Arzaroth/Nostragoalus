import { z } from 'zod'
import { db } from '../../../../../db'
import { rotateLeagueChatKey } from '../../../../utils/chat/service'
import { publishStateChanged } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({
  // The fresh group key sealed to each current member's public key (client-side).
  wraps: z.array(z.object({ userId: z.string(), wrappedKey: z.string().min(1).max(1024) })).max(2000),
})

// Rotate the league group key (OWNER/MODERATOR). Bumps the epoch and stores a new
// sealed group key for the current members; old ciphertext stays readable at the
// old epoch, removed members are left without the new key.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const res = await rotateLeagueChatKey(db, { leagueId, actorId: user.id, wraps: body.wraps })
  void publishStateChanged(db, leagueId).catch(() => {})
  return res
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Rotate the league chat key',
    description: 'OWNER/MODERATOR only. Bumps the key epoch and stores a fresh sealed group key per current member, revoking anyone no longer a member.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ epoch }.' }, '403': { description: 'Not an admin / chat disabled.' } },
  },
})
