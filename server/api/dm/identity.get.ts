import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { canDm, getPublicIdentity } from '../../utils/dm/service'
import type { DmParticipantDTO } from '../../../shared/types/dm'

// A user's chat public identity (name, avatar, public key), so the caller can seal
// a new DM thread key to them before the thread exists. Gated on DM reachability
// (shared league or the target opted into discovery) and 404 - not 403 - for an
// unreachable or chat-less target, so probing an id never confirms an account
// exists or leaks the name/key of someone the caller has no business messaging.
export default defineEventHandler(async (event) => {
  const caller = await requireUser(event)
  const userId = (getQuery(event).userId as string | undefined) ?? ''
  const identity = (await canDm(db, caller.id, userId)) ? await getPublicIdentity(db, userId) : null
  if (!identity) throw createError({ statusCode: 404, statusMessage: 'this user has not set up chat yet' })
  const dto: DmParticipantDTO = { userId: identity.userId, name: identity.name, image: identity.image, publicKey: identity.publicKey }
  return { identity: dto }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'A user chat public identity',
    description: 'Public key + name for sealing a new DM thread key to a recipient.',
    parameters: [{ in: 'query', name: 'userId', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ identity: DmParticipantDTO }.' }, '404': { description: 'No chat identity.' } },
  },
})
