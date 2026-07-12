import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { twoFactor, user } from '../../../db/schema'

// Admin recovery path: strip a user's 2FA entirely (lost authenticator etc.).
export async function removeTwoFactor(db: AppDatabase, userId: string): Promise<void> {
  await db.delete(twoFactor).where(eq(twoFactor.userId, userId))
  await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, userId))
}
