import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatAttachment, chatMessage } from '../../../db/schema'
import { ForbiddenError, NotFoundError } from '../errors'
import { getMembership } from '../leagues/service'

// Which of these messages carry an image, so a room listing can flag them without
// hauling the multi-megabyte ciphertext along.
export async function getAttachmentMessageIds(db: AppDatabase, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set()
  const rows = await db
    .select({ messageId: chatAttachment.messageId })
    .from(chatAttachment)
    .where(inArray(chatAttachment.messageId, messageIds))
  return new Set(rows.map((r) => r.messageId))
}

// The encrypted image for one message, fetched on demand when it is rendered.
// Members of the message's league only; the blob stays opaque to the server. A
// hidden message's image is withheld the same way messages.get strips it: a
// removed one from everyone, a pending one from non-moderators - otherwise the
// takedown could be undone by fetching the attachment directly by id.
export async function getAttachmentCiphertext(db: AppDatabase, messageId: string, userId: string): Promise<string> {
  const rows = await db
    .select({
      leagueId: chatMessage.leagueId,
      ciphertext: chatAttachment.ciphertext,
      moderation: chatMessage.moderationState,
    })
    .from(chatAttachment)
    .innerJoin(chatMessage, eq(chatMessage.id, chatAttachment.messageId))
    .where(eq(chatAttachment.messageId, messageId))
    .limit(1)
  if (!rows[0]) throw new NotFoundError('attachment not found')
  const membership = await getMembership(db, rows[0].leagueId, userId)
  if (!membership) throw new ForbiddenError('not a league member')
  const isAdmin = membership.role === 'OWNER' || membership.role === 'MODERATOR'
  if (rows[0].moderation === 'REMOVED' || (rows[0].moderation === 'PENDING' && !isAdmin)) {
    throw new NotFoundError('attachment not found')
  }
  return rows[0].ciphertext
}
