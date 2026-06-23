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
// Members of the message's league only; the blob stays opaque to the server.
export async function getAttachmentCiphertext(db: AppDatabase, messageId: string, userId: string): Promise<string> {
  const rows = await db
    .select({ leagueId: chatMessage.leagueId, ciphertext: chatAttachment.ciphertext })
    .from(chatAttachment)
    .innerJoin(chatMessage, eq(chatMessage.id, chatAttachment.messageId))
    .where(eq(chatAttachment.messageId, messageId))
    .limit(1)
  if (!rows[0]) throw new NotFoundError('attachment not found')
  const membership = await getMembership(db, rows[0].leagueId, userId)
  if (!membership) throw new ForbiddenError('not a league member')
  return rows[0].ciphertext
}
