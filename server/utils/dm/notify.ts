import type { AppDatabase } from '../../../db/types'
import { createNotification } from '../notifications/service'
import { displayName } from '../notifications/events'

// Notify the recipient of a new direct message: a header-bell entry plus a web
// push (createNotification does both, gated on the recipient's `dm` push toggle).
// The notification carries the thread + sender name only - the body is E2EE, so
// there is no preview. Best-effort: the caller fires and forgets so a delivery
// hiccup never fails the message post.
//
// The dedupeKey is the thread, not the message, with `refresh`: a whole
// conversation collapses to one bell row that resurfaces (bumped + unread) on each
// new message, so a chatty thread is a single entry, never one row per message.
export async function notifyDm(
  db: AppDatabase,
  opts: { threadId: string; senderId: string; recipientId: string },
): Promise<boolean> {
  const senderName = await displayName(db, opts.senderId)
  const created = await createNotification(db, {
    userId: opts.recipientId,
    data: { type: 'DM_MESSAGE', threadId: opts.threadId, senderId: opts.senderId, senderName },
    dedupeKey: `dm-thread:${opts.threadId}`,
    refresh: true,
  })
  return created !== null
}
