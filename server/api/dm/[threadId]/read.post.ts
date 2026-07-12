import { z } from 'zod'
import { db } from '../../../../db'
import { markThreadRead } from '../../../utils/dm/service'
import { defineValidatedHandler } from '../../../utils/validated-handler'

const responseSchema = z.object({ ok: z.literal(true) })

// Mark a thread read up to now for the caller (participant only); drives the inbox
// unread counts. Idempotent.
export default defineValidatedHandler({ response: responseSchema }, async ({ event, user }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  await markThreadRead(db, threadId, user.id)
  return { ok: true as const }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Mark a DM thread read',
    description: 'Sets the caller last-read marker to now for the thread. Participant only.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ ok: true }.' }, '404': { description: 'Not a participant.' } },
  },
})
