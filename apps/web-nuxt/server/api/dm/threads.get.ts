import { z } from 'zod'
import { db } from '../../../db'
import { listThreads } from '../../utils/dm/service'
import { defineReadHandler } from '../../utils/read-handler'
import type { DmThreadSummaryDTO } from '../../../shared/types/dm'

const responseSchema = z.object({
  threads: z.array(z.object({
    threadId: z.string(),
    other: z.object({ id: z.string(), name: z.string(), image: z.string().nullable() }),
    lastMessageAt: z.string().nullable(),
    unread: z.number(),
    myWrappedKey: z.string().nullable(),
  })),
})

// The signed-in user's DM inbox: every conversation, newest activity first, with
// the other participant, the unread count and the caller's sealed current key.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ user }) => {
  const rows = await listThreads(db, user.id)
  const threads: DmThreadSummaryDTO[] = rows.map((t) => ({
    threadId: t.threadId,
    other: t.other,
    lastMessageAt: t.lastMessageAt ? t.lastMessageAt.toISOString() : null,
    unread: t.unread,
    myWrappedKey: t.myWrappedKey,
  }))
  return { threads }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'My direct-message inbox',
    description: 'Every DM conversation for the signed-in user, newest activity first, with unread counts and the caller sealed key.',
    responses: { '200': { description: '{ threads: DmThreadSummaryDTO[] }.' }, '401': { description: 'Not signed in.' } },
  },
})
