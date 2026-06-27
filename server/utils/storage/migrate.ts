import { and, eq, isNotNull, like } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatAttachment, user } from '../../../db/schema'
import type { StorageDriver } from './driver'
import { putChatImage } from './service'
import { storeAvatarFromDataUrl } from '../auth/avatar'

export interface MigrateResult {
  chatMigrated: number
  avatarMigrated: number
}

// One-time backfill: move the image blobs still living in Postgres (chat
// attachment ciphertext, data: avatars) into the storage backend. Idempotent and
// resumable - the "still in the DB" predicate IS the work queue, so a crash
// mid-run leaves the flipped rows done and the rest queued, and a second run is a
// no-op. Each blob is written to storage BEFORE its column is cleared, so a
// concurrent reader never sees a row pointing at a missing object.
export async function migrateBlobsToStorage(
  db: AppDatabase,
  driver: StorageDriver,
  opts: { batchSize?: number } = {},
): Promise<MigrateResult> {
  const batchSize = opts.batchSize ?? 100
  let chatMigrated = 0
  for (;;) {
    const rows = await db
      .select({ messageId: chatAttachment.messageId, idx: chatAttachment.idx, ciphertext: chatAttachment.ciphertext })
      .from(chatAttachment)
      .where(isNotNull(chatAttachment.ciphertext))
      .limit(batchSize)
    if (rows.length === 0) break
    for (const r of rows) {
      const storageKey = await putChatImage(driver, r.messageId, r.idx, new TextEncoder().encode(r.ciphertext!))
      await db
        .update(chatAttachment)
        .set({ storageKey, ciphertext: null })
        .where(and(eq(chatAttachment.messageId, r.messageId), eq(chatAttachment.idx, r.idx)))
      chatMigrated += 1
    }
  }

  let avatarMigrated = 0
  for (;;) {
    const rows = await db.select({ id: user.id, image: user.image }).from(user).where(like(user.image, 'data:%')).limit(batchSize)
    if (rows.length === 0) break
    for (const r of rows) {
      const url = await storeAvatarFromDataUrl(driver, r.image!)
      await db.update(user).set({ image: url }).where(eq(user.id, r.id))
      avatarMigrated += 1
    }
  }

  return { chatMigrated, avatarMigrated }
}
