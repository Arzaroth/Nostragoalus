import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { user } from '../../../db/schema'
import { NotFoundError } from '../errors'

// Admin override: mark a user's email verified by hand (the mail never arrived,
// or a one-off rescue). Idempotent.
export async function forceVerifyUserEmail(db: AppDatabase, userId: string): Promise<void> {
  const rows = await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, userId))
    .returning({ id: user.id })
  if (!rows.length) throw new NotFoundError('user not found')
}
