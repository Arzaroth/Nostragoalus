import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { listDmMessages } from '../../../utils/dm/service'
import { toHttpError } from '../../../utils/http'
import type { DmMessageDTO } from '../../../../shared/types/dm'

// A page of ciphertext for one thread, newest first. `before`/`beforeId` page back
// through history; `thread` lists a root message replies. Participant-only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const threadId = getRouterParam(event, 'threadId') as string
  const q = getQuery(event)
  const before = typeof q.before === 'string' ? new Date(q.before) : undefined
  const beforeId = typeof q.beforeId === 'string' ? q.beforeId : undefined
  const limit = typeof q.limit === 'string' ? Number(q.limit) : undefined
  const thread = typeof q.thread === 'string' ? q.thread : undefined
  try {
    const rows = await listDmMessages(db, { threadId, userId: user.id, before, beforeId, limit, thread })
    const messages: DmMessageDTO[] = rows.map((r) => ({
      id: r.id,
      threadId,
      parentId: r.parentId,
      userId: r.userId,
      epoch: r.epoch,
      ciphertext: r.ciphertext,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      moderation: r.moderationState,
    }))
    return { messages }
  } catch (err) {
    throw toHttpError(err)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'List DM messages',
    description: 'A page of ciphertext for a thread, newest first, keyset-paginated. Participant only.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ messages: DmMessageDTO[] }.' }, '404': { description: 'Not a participant.' } },
  },
})
