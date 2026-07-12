import { z } from 'zod'
import { db } from '../../../db'
import { createThread } from '../../utils/dm/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  recipientId: z.string().min(1).max(64),
  // The DM thread key, sealed to each participant's public key (self + recipient).
  // Required only on first creation; ignored if the thread already exists.
  wraps: z
    .array(z.object({ userId: z.string().min(1).max(64), wrappedKey: z.string().min(1).max(4096) }))
    .length(2),
})

const responseSchema = z.object({ threadId: z.string(), epoch: z.number(), created: z.boolean() })

// Open (or reopen) a DM thread with a recipient. Idempotent: an existing thread is
// returned untouched. On first creation the caller's client supplies the thread
// key sealed to both participants; the server persists them at epoch 1.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user }) => {
  const result = await createThread(db, { userId: user.id, recipientId: body.recipientId, wraps: body.wraps })
  return { threadId: result.threadId, epoch: result.epoch, created: result.created }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Open a DM thread',
    description: 'Idempotent by participant pair. First creation seals the thread key to both participants.',
    responses: {
      '200': { description: '{ threadId, epoch, created }.' },
      '400': { description: 'Recipient has no chat identity / self / bad wraps.' },
      '401': { description: 'Not signed in.' },
    },
  },
})
