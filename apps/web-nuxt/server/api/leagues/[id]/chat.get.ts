import { z } from 'zod'
import { db } from '../../../../db'
import { getChatStatus } from '../../../utils/chat/service'
import { defineReadHandler } from '../../../utils/read-handler'

const memberKeySchema = z.object({ userId: z.string(), publicKey: z.string(), name: z.string() })
const responseSchema = z.object({
  enabled: z.boolean(),
  epoch: z.number(),
  role: z.string(),
  myWrappedKeys: z.array(z.object({ epoch: z.number(), wrappedKey: z.string() })),
  missingKeys: z.array(memberKeySchema),
  memberKeys: z.array(memberKeySchema),
  rekeyPending: z.boolean(),
})

// Chat status for a league member: whether chat is on, the current key epoch, the
// caller's sealed group key (to unwrap locally), members still missing a key (so
// a keyholder can wrap for them) and every member's public key (for enabling /
// wrapping). Members only - a 404 hides the league from non-members.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const leagueId = getRouterParam(event, 'id') as string
  return getChatStatus(db, leagueId, user.id)
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'League chat status + keys',
    description: 'Members only. Whether chat is enabled, the key epoch, the caller sealed key, members missing a key, and member public keys.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: 'Chat status payload.' }, '404': { description: 'Not a member / unknown league.' } },
  },
})
