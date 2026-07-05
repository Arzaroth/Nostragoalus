import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatAttachment, chatMessage } from '../../../db/schema'
import { ForbiddenError, NotFoundError } from '../errors'
import { getMembership } from '../leagues/service'
import { requireParticipant } from '../dm/service'
import { authorizeMessageActor } from './access'
import type { ChatAttachmentDTO } from '../../../shared/types/chat'
import type { StorageDriver } from '../storage/driver'
import { getChatImage, resolveStorage } from '../storage'

// The images on each of these messages (idx-ordered), so a room listing can
// describe them without hauling the multi-megabyte ciphertext along. Messages
// with no image are simply absent from the map.
export async function getMessageAttachments(
  db: AppDatabase,
  messageIds: string[],
): Promise<Map<string, ChatAttachmentDTO[]>> {
  const out = new Map<string, ChatAttachmentDTO[]>()
  if (messageIds.length === 0) return out
  const rows = await db
    .select({ messageId: chatAttachment.messageId, idx: chatAttachment.idx, epoch: chatAttachment.epoch })
    .from(chatAttachment)
    .where(inArray(chatAttachment.messageId, messageIds))
    .orderBy(asc(chatAttachment.idx))
  for (const r of rows) {
    const list = out.get(r.messageId)
    if (list) list.push({ idx: r.idx, epoch: r.epoch })
    else out.set(r.messageId, [{ idx: r.idx, epoch: r.epoch }])
  }
  return out
}

// One encrypted image (by message + idx), fetched on demand when it is rendered.
// Members of the message's league only; the blob stays opaque to the server. A
// hidden message's image is withheld the same way messages.get strips it: a
// removed one from everyone, a pending one from non-moderators - otherwise the
// takedown could be undone by fetching the attachment directly. Returns the
// ciphertext and its epoch so the client can pick the right key.
export async function getAttachmentCiphertext(
  db: AppDatabase,
  messageId: string,
  idx: number,
  userId: string,
  driver?: StorageDriver,
): Promise<{ ciphertext: string; epoch: number }> {
  // Authorize the actor on the message (league member or DM participant), then
  // load the image row. A non-participant/non-member throws before any bytes.
  const ctx = await authorizeMessageActor(db, messageId, userId)
  const rows = await db
    .select({
      ciphertext: chatAttachment.ciphertext,
      storageKey: chatAttachment.storageKey,
      epoch: chatAttachment.epoch,
      moderation: chatMessage.moderationState,
    })
    .from(chatAttachment)
    .innerJoin(chatMessage, eq(chatMessage.id, chatAttachment.messageId))
    .where(and(eq(chatAttachment.messageId, messageId), eq(chatAttachment.idx, idx)))
    .limit(1)
  if (!rows[0]) throw new NotFoundError('attachment not found')
  // Moderation hides an image the same way messages.get strips it, but only in a
  // league (a DM has no moderation - see chat/access).
  if (ctx.kind === 'league') {
    const isAdmin = ctx.role === 'OWNER' || ctx.role === 'MODERATOR'
    if (rows[0].moderation === 'REMOVED' || (rows[0].moderation === 'PENDING' && !isAdmin)) {
      throw new NotFoundError('attachment not found')
    }
  }
  // Legacy rows keep the ciphertext in the column; migrated rows hold a storage key
  // (the CHECK guarantees exactly one). The returned wire shape is identical either way.
  const ciphertext = rows[0].ciphertext ?? (await getChatImage(resolveStorage(driver), rows[0].storageKey!))
  return { ciphertext, epoch: rows[0].epoch }
}

export interface RoomMediaItem {
  messageId: string
  idx: number
  epoch: number
  createdAt: Date
}

// Every image in one room, newest message first then idx, for the media gallery.
// A room is a league room (league-global when matchId is null, else a match thread)
// or a DM thread. League members / DM participants only; league images on hidden
// messages are excluded the same way the listing/fetch hide them (a DM has no
// moderation).
export async function listRoomMedia(
  db: AppDatabase,
  opts: ({ leagueId: string; matchId?: string | null } | { threadId: string }) & { userId: string },
): Promise<RoomMediaItem[]> {
  let scope
  let visible
  if ('threadId' in opts) {
    await requireParticipant(db, opts.threadId, opts.userId)
    scope = eq(chatMessage.dmThreadId, opts.threadId)
    visible = eq(chatMessage.moderationState, 'VISIBLE')
  } else {
    const membership = await getMembership(db, opts.leagueId, opts.userId)
    if (!membership) throw new ForbiddenError('not a league member')
    const isAdmin = membership.role === 'OWNER' || membership.role === 'MODERATOR'
    const room = opts.matchId ? eq(chatMessage.matchId, opts.matchId) : isNull(chatMessage.matchId)
    scope = and(eq(chatMessage.leagueId, opts.leagueId), room)
    visible = isAdmin
      ? inArray(chatMessage.moderationState, ['VISIBLE', 'PENDING'])
      : eq(chatMessage.moderationState, 'VISIBLE')
  }
  const rows = await db
    .select({
      messageId: chatAttachment.messageId,
      idx: chatAttachment.idx,
      epoch: chatAttachment.epoch,
      createdAt: chatMessage.createdAt,
    })
    .from(chatAttachment)
    .innerJoin(chatMessage, eq(chatMessage.id, chatAttachment.messageId))
    .where(and(scope, visible))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id), asc(chatAttachment.idx))
  return rows.map((r) => ({ messageId: r.messageId, idx: r.idx, epoch: r.epoch, createdAt: r.createdAt }))
}
