import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { getChatStatus } from '../../../utils/chat/service'
import { toHttpError } from '../../../utils/http'

// Chat status for a league member: whether chat is on, the current key epoch, the
// caller's sealed group key (to unwrap locally), members still missing a key (so
// a keyholder can wrap for them) and every member's public key (for enabling /
// wrapping). Members only - a 404 hides the league from non-members.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const leagueId = getRouterParam(event, 'id') as string
  try {
    return await getChatStatus(db, leagueId, user.id)
  } catch (err) {
    throw toHttpError(err)
  }
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
