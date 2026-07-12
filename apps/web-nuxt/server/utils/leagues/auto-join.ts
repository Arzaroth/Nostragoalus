import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leagueMember, leagueOptOut, ssoProvider, ssoProviderLeague, user } from '../../../db/schema'
import { domainMatchesList, domainOfEmail } from '../auth/sso-domains'
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

// Admin "apply now": auto-join is otherwise only triggered on a user's SSO
// login. This back-fills it for every EXISTING user whose email domain a
// linked provider captures - so configuring provider leagues takes effect
// without waiting for everyone to log in again. Honors opt-outs/memberships
// (autoJoinSsoLeagues is idempotent).
export async function applyAllProviderAutoJoins(
  db: AppDatabase,
): Promise<{ providers: number; usersMatched: number; joined: number }> {
  const links = await db.selectDistinct({ providerId: ssoProviderLeague.providerId }).from(ssoProviderLeague)
  const providerIds = links.map((l) => l.providerId)
  if (providerIds.length === 0) return { providers: 0, usersMatched: 0, joined: 0 }

  // Fetch the providers via the FK target, so every row is guaranteed present
  // (no orphan-link branch) and carries its captured domains.
  const providers = await db
    .select({ providerId: ssoProvider.providerId, domain: ssoProvider.domain })
    .from(ssoProvider)
    .where(inArray(ssoProvider.providerId, providerIds))
  const allUsers = await db.select({ id: user.id, email: user.email }).from(user)
  let usersMatched = 0
  let joined = 0
  for (const provider of providers) {
    for (const u of allUsers) {
      const domain = domainOfEmail(u.email)
      if (!domain || !domainMatchesList(domain, provider.domain)) continue
      usersMatched += 1
      joined += (await autoJoinSsoLeagues(db, { userId: u.id, providerId: provider.providerId })).length
    }
  }
  return { providers: providers.length, usersMatched, joined }
}
