import { and, eq, lt, notExists, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { account, user } from '../../../db/schema'
import { loadEmailVerificationFlag } from './email-verification'

export interface PruneResult {
  pruned: number
  skipped?: 'verification-disabled'
}

// Delete accounts that never confirmed their email. Guard rails:
//   - ONLY runs when email verification is required - otherwise "unverified" is
//     the normal state for every account and this would wipe the user base.
//   - grace window: only accounts older than maxAgeDays (default 7).
//   - never an SSO-linked account (a non-credential account row) - those are
//     IdP-verified and exempt.
//   - never an admin (break-glass access must not auto-delete).
// FK cascades remove any dependent rows, but unverified accounts can't sign in
// while the flag is on, so they have nothing worth keeping.
export async function pruneUnverifiedUsers(
  db: AppDatabase,
  opts: { maxAgeDays?: number; now?: Date } = {},
): Promise<PruneResult> {
  if (!(await loadEmailVerificationFlag(db))) return { pruned: 0, skipped: 'verification-disabled' }

  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - (opts.maxAgeDays ?? 7) * 24 * 60 * 60 * 1000)

  const deleted = await db
    .delete(user)
    .where(
      and(
        eq(user.emailVerified, false),
        lt(user.createdAt, cutoff),
        // null role = ordinary user; only a literal 'admin' is exempt.
        sql`coalesce(${user.role}, '') <> 'admin'`,
        notExists(
          db
            .select({ one: sql`1` })
            .from(account)
            .where(and(eq(account.userId, user.id), sql`${account.providerId} <> 'credential'`)),
        ),
      ),
    )
    .returning({ id: user.id })

  return { pruned: deleted.length }
}
