import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { markThreadRead } from '../../../utils/dm/service'
import { toHttpError } from '../../../utils/http'

// Mark a thread read up to now for the caller (participant only); drives the inbox
// unread counts. Idempotent.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const threadId = getRouterParam(event, 'threadId') as string
  try {
    await markThreadRead(db, threadId, user.id)
    return { ok: true }
  } catch (err) {
    throw toHttpError(err)
  }
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
