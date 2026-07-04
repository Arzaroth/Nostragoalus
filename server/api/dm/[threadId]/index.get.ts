import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { getThreadDetail } from '../../../utils/dm/service'
import { toHttpError } from '../../../utils/http'
import type { DmThreadDetailDTO } from '../../../../shared/types/dm'

// Detail for one thread the caller is in: the other participant public identity
// and the caller sealed key for every epoch. 404s for a non-participant.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const threadId = getRouterParam(event, 'threadId') as string
  try {
    const detail = await getThreadDetail(db, threadId, user.id)
    const dto: DmThreadDetailDTO = {
      threadId: detail.threadId,
      epoch: detail.epoch,
      other: { userId: detail.other.userId, name: detail.other.name, image: detail.other.image, publicKey: detail.other.publicKey },
      myWrappedKeys: detail.myWrappedKeys,
    }
    return { thread: dto }
  } catch (err) {
    throw toHttpError(err)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'DM thread detail',
    description: 'The other participant and the caller sealed keys (all epochs) for a thread they are in.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ thread: DmThreadDetailDTO }.' }, '404': { description: 'Not a participant.' } },
  },
})
