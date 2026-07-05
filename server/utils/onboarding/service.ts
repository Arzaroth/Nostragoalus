import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { user } from '../../../db/schema'

// Stamp the one-time onboarding tour as done. Idempotent: the `is null` guard
// keeps a re-run (finish then skip, two tabs) from moving an already-set
// timestamp, so the tour never re-auto-starts once resolved.
export async function dismissOnboardingTour(db: AppDatabase, userId: string): Promise<void> {
  await db
    .update(user)
    .set({ onboardingTourDismissedAt: new Date() })
    .where(and(eq(user.id, userId), sql`${user.onboardingTourDismissedAt} is null`))
}
