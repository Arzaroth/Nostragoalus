import { z } from 'zod'
import { db } from '../../../../db'
import { addDmWrappedKey } from '../../../utils/dm/service'
import { defineValidatedHandler } from '../../../utils/validated-handler'

const bodySchema = z.object({
  targetUserId: z.string().min(1).max(64),
  epoch: z.number().int().positive(),
  // The current thread key, re-sealed to the other participant's (new) public key.
  wrappedKey: z.string().min(1).max(4096),
})

const responseSchema = z.object({ added: z.number() })

// Re-seal the current thread key to the other participant. Used after they reset their
// identity: the remaining keyholder seals the key to their new public key so the thread
// comes back for them. Participant-only; target must be the other party, epoch current.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  return await addDmWrappedKey(db, {
    threadId,
    actorId: user.id,
    targetUserId: body.targetUserId,
    epoch: body.epoch,
    wrappedKey: body.wrappedKey,
  })
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Re-seal the thread key to the other participant',
    description: 'Seals the current thread key to the other participant (after they reset their identity). Participant-only; idempotent.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ added }.' },
      '404': { description: 'Not a participant.' },
      '409': { description: 'Stale key epoch.' },
    },
  },
})
