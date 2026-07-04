import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { getPublicIdentity } from '../../utils/dm/service'
import type { DmParticipantDTO } from '../../../shared/types/dm'

// A user's chat public identity (name, avatar, public key), so the caller can seal
// a new DM thread key to them before the thread exists. Public keys are public;
// 404 if the target has never set up chat (they cannot be DMed yet).
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const userId = (getQuery(event).userId as string | undefined) ?? ''
  const identity = await getPublicIdentity(db, userId)
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
