import { z } from 'zod'
import { db } from '../../../../../db'
import { chatMessageSchema } from '../../../../schemas/dm'
import { getThreadCounts, listMessages } from '../../../../utils/chat/service'
import { getMyReactions, getReactionTotals } from '../../../../utils/chat/reactions'
import { getMessageAttachments } from '../../../../utils/chat/attachments'
import { getMyReports } from '../../../../utils/chat/moderation'
import { getRoomReadMarker } from '../../../../utils/chat/unread'
import { getMembership } from '../../../../utils/leagues/service'
import { defineReadHandler } from '../../../../utils/read-handler'
import { emptyReactionTotals } from '../../../../../shared/reactions'
import { roomKeyFor, type ChatMessageDTO } from '../../../../../shared/types/chat'

const querySchema = z.object({
  matchId: z.string().optional(),
  before: z.string().optional(),
  beforeId: z.string().optional(),
  limit: z.string().optional(),
  thread: z.string().optional(),
})
const responseSchema = z.object({
  messages: z.array(chatMessageSchema),
  readMarker: z.string().nullable(),
})

// A page of ciphertext for one room (matchId omitted = league-global room),
// newest first. before= pages backwards. Members only (service enforces).
export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ event, user, query }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const before = typeof query.before === 'string' ? new Date(query.before) : undefined
  const limit = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const thread = typeof query.thread === 'string' ? query.thread : null
  const matchId = typeof query.matchId === 'string' ? query.matchId : null
  const rows = await listMessages(db, {
    leagueId,
    userId: user.id,
    matchId,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    beforeId: typeof query.beforeId === 'string' ? query.beforeId : undefined,
    limit: limit && !Number.isNaN(limit) ? limit : undefined,
    thread,
  })
  const ids = rows.map((r) => r.id)
  const membership = await getMembership(db, leagueId, user.id)
  const isAdmin = membership?.role === 'OWNER' || membership?.role === 'MODERATOR'
  const [totals, mine, attachmentsByMessage, reported, threadCounts] = await Promise.all([
    getReactionTotals(db, ids),
    getMyReactions(db, user.id, ids),
    getMessageAttachments(db, ids),
    getMyReports(db, user.id, ids),
    // Thread counts only matter for the main list, not within a thread.
    thread ? Promise.resolve<Record<string, number>>({}) : getThreadCounts(db, ids),
  ])
  const messages: ChatMessageDTO[] = rows.map((r) => {
    // Strip content for a tombstoned message (everyone) or a pending one (from
    // non-moderators), so the server never hands out what should be hidden.
    const hidden = r.moderationState === 'REMOVED' || (r.moderationState === 'PENDING' && !isAdmin)
    return {
      id: r.id,
      leagueId,
      matchId: r.matchId,
      parentId: r.parentId,
      threadId: r.threadId,
      userId: r.userId,
      epoch: r.epoch,
      ciphertext: hidden ? '' : r.ciphertext,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      attachments: hidden ? [] : (attachmentsByMessage.get(r.id) ?? []),
      moderation: r.moderationState,
      reported: reported.has(r.id),
      reactions: totals[r.id] ?? emptyReactionTotals(),
      myReaction: mine[r.id] ?? null,
      threadCount: threadCounts[r.id] ?? 0,
    }
  })
  // Only the initial main-list page needs the read marker (for the "new
  // messages" divider); thread views and backward paging never draw it.
  const readMarker = thread || before ? null : await getRoomReadMarker(db, user.id, leagueId, roomKeyFor(matchId))
  return { messages, readMarker }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'List chat ciphertext',
    description: 'Members only. A page of encrypted messages for the league room (or a match thread with ?matchId=), newest first.',
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'matchId', required: false, schema: { type: 'string' } },
      { in: 'query', name: 'before', required: false, schema: { type: 'string', format: 'date-time' } },
      { in: 'query', name: 'beforeId', required: false, schema: { type: 'string' }, description: 'Pair with ?before=: the last seen message id, to break createdAt ties at a page boundary.' },
      { in: 'query', name: 'limit', required: false, schema: { type: 'integer' } },
      { in: 'query', name: 'thread', required: false, schema: { type: 'string' }, description: 'A parent message id: list that thread\'s replies instead of top-level messages.' },
    ],
    responses: { '200': { description: '{ messages: ChatMessageDTO[], readMarker: string | null }. readMarker is the caller\'s last-read time for the room (ISO), null on thread/paged fetches or an unopened room.' }, '403': { description: 'Not a member.' } },
  },
})
