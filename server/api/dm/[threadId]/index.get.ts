import { z } from 'zod'
import { db } from '../../../../db'
import { dmParticipantSchema } from '../../../schemas/dm'
import { getThreadDetail } from '../../../utils/dm/service'
import { defineReadHandler } from '../../../utils/read-handler'
import type { DmThreadDetailDTO } from '../../../../shared/types/dm'

const responseSchema = z.object({
  thread: z.object({
    threadId: z.string(),
    epoch: z.number(),
    other: dmParticipantSchema,
    myWrappedKeys: z.array(z.object({ epoch: z.number(), wrappedKey: z.string() })),
    otherMissingCurrentKey: z.boolean(),
  }),
})

// Detail for one thread the caller is in: the other participant public identity
// and the caller sealed key for every epoch. 404s for a non-participant.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  const detail = await getThreadDetail(db, threadId, user.id)
  const dto: DmThreadDetailDTO = {
    threadId: detail.threadId,
    epoch: detail.epoch,
    other: { userId: detail.other.userId, name: detail.other.name, image: detail.other.image, publicKey: detail.other.publicKey },
    myWrappedKeys: detail.myWrappedKeys,
    otherMissingCurrentKey: detail.otherMissingCurrentKey,
  }
  return { thread: dto }
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
