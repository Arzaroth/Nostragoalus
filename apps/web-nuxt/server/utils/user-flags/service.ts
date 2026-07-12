import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { user } from '../../../db/schema'

// The one-time user flags: a nullable `*DismissedAt` timestamp that, once
// stamped, means "this user has finished/dismissed X and must never be prompted
// again". The union is explicit so adding a new one-time prompt is a deliberate
// opt-in, not any nullable column.
export type UserOnceFlag = 'leaguePromptDismissedAt' | 'onboardingTourDismissedAt'

// Stamp a one-time flag as done. Idempotent: the `is null` guard keeps a re-run
// (finish then skip, two tabs) from moving an already-set timestamp, so whatever
// the flag gates never re-fires once it has been resolved.
export async function stampUserFlagOnce(db: AppDatabase, userId: string, flag: UserOnceFlag): Promise<void> {
  await db
    .update(user)
    .set({ [flag]: new Date() })
    .where(and(eq(user.id, userId), sql`${user[flag]} is null`))
}
