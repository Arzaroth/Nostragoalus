import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leagueMember, leagueOptOut, ssoProviderLeague, user } from '../../../db/schema'
import { claimMembership } from './service'

// Runs on every SSO login (provisionUserOnEveryLogin), so it must be
// idempotent: skip leagues the user is in, and honor explicit leaves.
export async function autoJoinSsoLeagues(
  db: AppDatabase,
  opts: { userId: string; providerId: string },
): Promise<string[]> {
  const linked = await db
    .select({ leagueId: ssoProviderLeague.leagueId })
    .from(ssoProviderLeague)
    .where(eq(ssoProviderLeague.providerId, opts.providerId))
  if (linked.length === 0) return []
  const leagueIds = linked.map((l) => l.leagueId)

  const [memberships, optOuts] = await Promise.all([
    db
      .select({ leagueId: leagueMember.leagueId })
      .from(leagueMember)
      .where(and(eq(leagueMember.userId, opts.userId), inArray(leagueMember.leagueId, leagueIds))),
    db
      .select({ leagueId: leagueOptOut.leagueId })
      .from(leagueOptOut)
      .where(and(eq(leagueOptOut.userId, opts.userId), inArray(leagueOptOut.leagueId, leagueIds))),
  ])
  const skip = new Set([...memberships, ...optOuts].map((r) => r.leagueId))
  const toJoin = leagueIds.filter((id) => !skip.has(id))
  if (toJoin.length === 0) return []

  // First one into an ownerless league becomes its owner, same as the deliberate
  // join paths. claimMembership relies on the single-owner unique index, so a
  // concurrent first-login can't create a second OWNER (the loser throws and is
  // caught by the SSO provisionUser wrapper - the user auto-joins next login).
  const joined: string[] = []
  for (const leagueId of toJoin) {
    await claimMembership(db, leagueId, opts.userId)
    joined.push(leagueId)
  }
  // Auto-joined users have a league: the one-time prompt would be noise.
  await db
    .update(user)
    .set({ leaguePromptDismissedAt: new Date() })
    .where(and(eq(user.id, opts.userId), sql`${user.leaguePromptDismissedAt} is null`))
  return joined
}
