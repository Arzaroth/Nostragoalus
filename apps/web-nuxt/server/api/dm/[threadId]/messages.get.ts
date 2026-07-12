import { z } from 'zod'
import { db } from '../../../../db'
import { chatMessageSchema } from '../../../schemas/dm'
import { getDmReadMarker, listDmMessages } from '../../../utils/dm/service'
import { getThreadCounts } from '../../../utils/chat/service'
import { getMyReactions, getReactionTotals } from '../../../utils/chat/reactions'
import { getMessageAttachments } from '../../../utils/chat/attachments'
import { defineReadHandler } from '../../../utils/read-handler'
import { emptyReactionTotals } from '../../../../shared/reactions'
import type { ChatMessageDTO } from '../../../../shared/types/chat'

const querySchema = z.object({
  before: z.string().optional(),
  beforeId: z.string().optional(),
  limit: z.string().optional(),
  thread: z.string().optional(),
})
const responseSchema = z.object({
  messages: z.array(chatMessageSchema),
  readMarker: z.string().nullable(),
})

// A page of ciphertext for one thread, newest first. `before`/`beforeId` page back
// through history; `thread` lists a root message's replies (oldest-first). Each
// message carries full league-chat parity (attachments, reactions, thread count);
// DM has no league/match (leagueId '', matchId null) and no moderation (VISIBLE).
export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ event, user, query }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  const before = typeof query.before === 'string' ? new Date(query.before) : undefined
  const beforeId = typeof query.beforeId === 'string' ? query.beforeId : undefined
  const limit = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const thread = typeof query.thread === 'string' ? query.thread : undefined
  {
    const rows = await listDmMessages(db, {
      threadId,
      userId: user.id,
      before: before && !Number.isNaN(before.getTime()) ? before : undefined,
      beforeId,
      limit: limit && !Number.isNaN(limit) ? limit : undefined,
      thread,
    })
    const ids = rows.map((r) => r.id)
    const [totals, mine, attachmentsByMessage, threadCounts] = await Promise.all([
      getReactionTotals(db, ids),
      getMyReactions(db, user.id, ids),
      getMessageAttachments(db, ids),
      // Thread counts only matter for the main list, not within a thread.
      thread ? Promise.resolve<Record<string, number>>({}) : getThreadCounts(db, ids),
    ])
    const messages: ChatMessageDTO[] = rows.map((r) => ({
      id: r.id,
      leagueId: '',
      matchId: null,
      parentId: r.parentId,
      threadId: r.threadId,
      userId: r.userId,
      epoch: r.epoch,
      ciphertext: r.ciphertext,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      attachments: attachmentsByMessage.get(r.id) ?? [],
      moderation: 'VISIBLE',
      reported: false,
      reactions: totals[r.id] ?? emptyReactionTotals(),
      myReaction: mine[r.id] ?? null,
      threadCount: threadCounts[r.id] ?? 0,
    }))
    // Only the initial main-list page needs the read marker (for the "new
    // messages" divider); thread views and backward paging never draw it.
    const readMarker = thread || before ? null : (await getDmReadMarker(db, threadId, user.id))?.toISOString() ?? null
    return { messages, readMarker }
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'List DM messages',
    description: 'Participant only. A page of encrypted messages for a thread, newest first, keyset-paginated. Each is a ChatMessageDTO (attachments, reactions, thread count); DM has no league/match and no moderation.',
    parameters: [
      { in: 'path', name: 'threadId', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'before', required: false, schema: { type: 'string', format: 'date-time' } },
      { in: 'query', name: 'beforeId', required: false, schema: { type: 'string' } },
      { in: 'query', name: 'thread', required: false, schema: { type: 'string' }, description: 'A root message id: list that thread\'s replies instead of top-level messages.' },
    ],
    responses: { '200': { description: '{ messages: ChatMessageDTO[], readMarker: string | null }.' }, '404': { description: 'Not a participant.' } },
  },
})
