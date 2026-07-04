import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatAttachment, chatMessage } from '../../../db/schema'
import { ForbiddenError, NotFoundError } from '../errors'
import { getMembership } from '../leagues/service'
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
  const rows = await db
    .select({
      leagueId: chatMessage.leagueId,
      ciphertext: chatAttachment.ciphertext,
      storageKey: chatAttachment.storageKey,
      epoch: chatAttachment.epoch,
      moderation: chatMessage.moderationState,
    })
    .from(chatAttachment)
    .innerJoin(chatMessage, eq(chatMessage.id, chatAttachment.messageId))
    .where(and(eq(chatAttachment.messageId, messageId), eq(chatAttachment.idx, idx)))
    .limit(1)
  // A null leagueId is a direct-message attachment - not reachable through a league route.
  if (!rows[0] || rows[0].leagueId === null) throw new NotFoundError('attachment not found')
  const membership = await getMembership(db, rows[0].leagueId, userId)
  if (!membership) throw new ForbiddenError('not a league member')
  const isAdmin = membership.role === 'OWNER' || membership.role === 'MODERATOR'
  if (rows[0].moderation === 'REMOVED' || (rows[0].moderation === 'PENDING' && !isAdmin)) {
    throw new NotFoundError('attachment not found')
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

// Every image in one room (league-global when matchId is null, else a match
// thread), newest message first then idx, for the media gallery. Members only;
// images on hidden messages are excluded the same way the listing/fetch hide them
// (removed from everyone, pending from non-moderators).
export async function listRoomMedia(
  db: AppDatabase,
  opts: { leagueId: string; matchId?: string | null; userId: string },
): Promise<RoomMediaItem[]> {
  const membership = await getMembership(db, opts.leagueId, opts.userId)
  if (!membership) throw new ForbiddenError('not a league member')
  const isAdmin = membership.role === 'OWNER' || membership.role === 'MODERATOR'
  const room = opts.matchId ? eq(chatMessage.matchId, opts.matchId) : isNull(chatMessage.matchId)
  const visible = isAdmin
    ? inArray(chatMessage.moderationState, ['VISIBLE', 'PENDING'])
    : eq(chatMessage.moderationState, 'VISIBLE')
  const rows = await db
    .select({
      messageId: chatAttachment.messageId,
      idx: chatAttachment.idx,
      epoch: chatAttachment.epoch,
      createdAt: chatMessage.createdAt,
    })
    .from(chatAttachment)
    .innerJoin(chatMessage, eq(chatMessage.id, chatAttachment.messageId))
    .where(and(eq(chatMessage.leagueId, opts.leagueId), room, visible))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id), asc(chatAttachment.idx))
  return rows.map((r) => ({ messageId: r.messageId, idx: r.idx, epoch: r.epoch, createdAt: r.createdAt }))
}
