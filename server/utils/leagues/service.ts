import { and, asc, count, eq, inArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { AppDatabase } from '../../../db/types'
import {
  competition,
  league,
  leagueLeaderboardRank,
  leagueMember,
  leagueOptOut,
  ssoProvider,
  ssoProviderLeague,
  user,
} from '../../../db/schema'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { generateJoinCode, normalizeJoinCode, type JoinCodeGenerator } from './code'
import { canKick, canSeeJoinCode, type LeagueRole } from './permissions'

export type LeagueVisibility = 'PRIVATE' | 'PUBLIC'

export interface LeagueRow {
  id: string
  competitionId: string
  name: string
  visibility: LeagueVisibility
  joinCode: string
  createdBy: string | null
  createdAt: Date
}

export interface LeagueSummary {
  id: string
  name: string
  visibility: LeagueVisibility
  role: LeagueRole
  memberCount: number
  competition: { id: string; slug: string; name: string }
  joinCode?: string
}

const MAX_CODE_ATTEMPTS = 5

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  // Postgres unique_violation; drizzle wraps the driver error as `cause`.
  const { code, cause } = error as { code?: string; cause?: unknown }
  return code === '23505' || isUniqueViolation(cause)
}

async function stampPromptDismissed(db: AppDatabase, userId: string): Promise<void> {
  await db
    .update(user)
    .set({ leaguePromptDismissedAt: new Date() })
    .where(and(eq(user.id, userId), sql`${user.leaguePromptDismissedAt} is null`))
}

export async function getLeague(db: AppDatabase, id: string): Promise<LeagueRow | null> {
  const rows = await db.select().from(league).where(eq(league.id, id)).limit(1)
  return (rows[0] as LeagueRow | undefined) ?? null
}

export async function findLeagueByCode(db: AppDatabase, rawCode: string): Promise<LeagueRow | null> {
  const code = normalizeJoinCode(rawCode)
  if (!code) return null
  const rows = await db.select().from(league).where(eq(league.joinCode, code)).limit(1)
  return (rows[0] as LeagueRow | undefined) ?? null
}

export async function getMembership(
  db: AppDatabase,
  leagueId: string,
  userId: string,
): Promise<{ role: LeagueRole; joinedAt: Date } | null> {
  const rows = await db
    .select({ role: leagueMember.role, joinedAt: leagueMember.joinedAt })
    .from(leagueMember)
    .where(and(eq(leagueMember.leagueId, leagueId), eq(leagueMember.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

// Visibility rule used by every scoped read: members always, anyone for
// PUBLIC leagues, admins for moderation.
export function canViewLeague(
  row: Pick<LeagueRow, 'visibility'>,
  membership: { role: LeagueRole } | null,
  isAdmin = false,
): boolean {
  return membership !== null || row.visibility === 'PUBLIC' || isAdmin
}

export interface CreateLeagueOptions {
  competitionId: string
  name: string
  ownerId: string
  visibility?: LeagueVisibility
  codeGen?: JoinCodeGenerator
}

export async function createLeague(db: AppDatabase, opts: CreateLeagueOptions): Promise<LeagueRow> {
  const codeGen = opts.codeGen ?? generateJoinCode
  for (let attempt = 1; ; attempt++) {
    try {
      // One transaction: a failure after the league row must not leave an
      // orphaned, ownerless league with a live join code.
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(league)
          .values({
            competitionId: opts.competitionId,
            name: opts.name,
            visibility: opts.visibility ?? 'PRIVATE',
            joinCode: codeGen(),
            createdBy: opts.ownerId,
          })
          .returning()
        await tx.insert(leagueMember).values({ leagueId: row.id, userId: opts.ownerId, role: 'OWNER' })
        await stampPromptDismissed(tx, opts.ownerId)
        return row as LeagueRow
      })
    } catch (error) {
      // Only the join-code collision is retryable; the tx rolled back fully.
      if (!isUniqueViolation(error) || attempt >= MAX_CODE_ATTEMPTS) throw error
    }
  }
}

export async function listUserLeagues(db: AppDatabase, userId: string, competitionId?: string): Promise<LeagueSummary[]> {
  const memberCount = db.$count(leagueMember, eq(leagueMember.leagueId, league.id))
  const rows = await db
    .select({
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      joinCode: league.joinCode,
      role: leagueMember.role,
      memberCount,
      competitionId: competition.id,
      competitionSlug: competition.slug,
      competitionName: competition.name,
    })
    .from(leagueMember)
    .innerJoin(league, eq(league.id, leagueMember.leagueId))
    .innerJoin(competition, eq(competition.id, league.competitionId))
    .where(
      competitionId
        ? and(eq(leagueMember.userId, userId), eq(league.competitionId, competitionId))
        : eq(leagueMember.userId, userId),
    )
    .orderBy(asc(competition.slug), asc(league.name))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    visibility: r.visibility as LeagueVisibility,
    role: r.role as LeagueRole,
    memberCount: Number(r.memberCount),
    competition: { id: r.competitionId, slug: r.competitionSlug, name: r.competitionName },
    ...(canSeeJoinCode(r.role as LeagueRole) ? { joinCode: r.joinCode } : {}),
  }))
}

export async function listPublicLeagues(
  db: AppDatabase,
  competitionId: string,
): Promise<Array<{ id: string; name: string; memberCount: number }>> {
  const memberCount = db.$count(leagueMember, eq(leagueMember.leagueId, league.id))
  const rows = await db
    .select({ id: league.id, name: league.name, memberCount })
    .from(league)
    .where(and(eq(league.competitionId, competitionId), eq(league.visibility, 'PUBLIC')))
    .orderBy(asc(league.name))
  return rows.map((r) => ({ ...r, memberCount: Number(r.memberCount) }))
}

// Honest roster size: every member regardless of visibility. The header count
// stays truthful while the listed roster hides admin-hidden members.
export async function countLeagueMembers(db: AppDatabase, leagueId: string): Promise<number> {
  return db.$count(leagueMember, eq(leagueMember.leagueId, leagueId))
}

export async function listLeagueMembers(
  db: AppDatabase,
  leagueId: string,
  opts?: { includePrivate?: boolean; includeHidden?: boolean; viewerId?: string },
): Promise<Array<{ userId: string; name: string; image: string | null; role: LeagueRole; joinedAt: Date }>> {
  // Same visibility rule as the league board: profilePrivate users hidden from
  // outsiders, admin-hidden users hidden from everyone but site admins. The
  // viewer always sees themselves (a hidden member still appears in their own
  // league's roster).
  const visibility = and(
    ...(opts?.includePrivate ? [] : [eq(user.profilePrivate, false)]),
    ...(opts?.includeHidden ? [] : [eq(user.hiddenFromLeaderboard, false)]),
  )
  const where = and(
    eq(leagueMember.leagueId, leagueId),
    opts?.viewerId ? or(eq(user.id, opts.viewerId), visibility) : visibility,
  )
  const rows = await db
    .select({
      userId: leagueMember.userId,
      name: user.name,
      image: user.image,
      role: leagueMember.role,
      joinedAt: leagueMember.joinedAt,
    })
    .from(leagueMember)
    .innerJoin(user, eq(user.id, leagueMember.userId))
    .where(where)
    .orderBy(
      sql`case ${leagueMember.role} when 'OWNER' then 0 when 'MODERATOR' then 1 else 2 end`,
      asc(leagueMember.joinedAt),
      asc(leagueMember.userId),
    )
  return rows as Array<{ userId: string; name: string; image: string | null; role: LeagueRole; joinedAt: Date }>
}

export async function leagueHasOwner(db: AppDatabase, leagueId: string): Promise<boolean> {
  const owners = await db
    .select({ userId: leagueMember.userId })
    .from(leagueMember)
    .where(and(eq(leagueMember.leagueId, leagueId), eq(leagueMember.role, 'OWNER')))
    .limit(1)
  return owners.length > 0
}

// Membership insert for an ownerless-league claim: the first one in becomes
// OWNER. The single-owner unique index makes it race-safe at the DB level - a
// concurrent second OWNER insert is rejected (surfaced as a 409 by toHttpError)
// rather than creating two owners; the loser retries and joins as a member.
export async function claimMembership(db: AppDatabase, leagueId: string, userId: string): Promise<LeagueRole> {
  const role: LeagueRole = (await leagueHasOwner(db, leagueId)) ? 'MEMBER' : 'OWNER'
  await db.insert(leagueMember).values({ leagueId, userId, role })
  return role
}

// Joining an ownerless league (admin-created without an owner, emptied by
// everyone leaving, or orphaned by account deletion) claims ownership: the
// first one in becomes OWNER. Applies to code, public and SSO auto-joins.
export async function addMembership(db: AppDatabase, leagueId: string, userId: string): Promise<LeagueRole> {
  const role = await claimMembership(db, leagueId, userId)
  await db.delete(leagueOptOut).where(and(eq(leagueOptOut.leagueId, leagueId), eq(leagueOptOut.userId, userId)))
  await stampPromptDismissed(db, userId)
  return role
}

export interface JoinResult {
  league: LeagueRow
  role: LeagueRole
}

export async function joinLeagueByCode(db: AppDatabase, opts: { userId: string; code: string }): Promise<JoinResult> {
  const row = await findLeagueByCode(db, opts.code)
  if (!row) throw new NotFoundError('no league matches this code')
  if (await getMembership(db, row.id, opts.userId)) throw new ConflictError('already a member of this league')
  const role = await addMembership(db, row.id, opts.userId)
  return { league: row, role }
}

export async function joinPublicLeague(db: AppDatabase, opts: { userId: string; leagueId: string }): Promise<JoinResult> {
  const row = await getLeague(db, opts.leagueId)
  // Private leagues 404 here on purpose: ids must not leak existence.
  if (!row || row.visibility !== 'PUBLIC') throw new NotFoundError('league not found')
  if (await getMembership(db, row.id, opts.userId)) throw new ConflictError('already a member of this league')
  const role = await addMembership(db, row.id, opts.userId)
  return { league: row, role }
}

export async function leaveLeague(db: AppDatabase, opts: { leagueId: string; userId: string }): Promise<void> {
  const membership = await getMembership(db, opts.leagueId, opts.userId)
  if (!membership) throw new NotFoundError('not a member of this league')
  if (membership.role === 'OWNER') {
    const [others] = await db
      .select({ n: count() })
      .from(leagueMember)
      .where(eq(leagueMember.leagueId, opts.leagueId))
    if (Number(others?.n ?? 0) > 1) {
      throw new ConflictError('transfer ownership or delete the league before leaving')
    }
  }
  // The last member leaving keeps the league around (empty, ownerless): its
  // code stays valid and the next joiner claims ownership. Admins clean up
  // abandoned leagues with the prune action.
  await removeMembership(db, opts.leagueId, opts.userId)
}

// Irreversible admin cleanup: drop every league without a single member.
export async function pruneEmptyLeagues(db: AppDatabase): Promise<number> {
  // Keep SSO-linked leagues: those are created empty by design and populate on
  // future logins; pruning them would silently break auto-join.
  const rows = await db
    .delete(league)
    .where(
      sql`not exists (select 1 from ${leagueMember} where ${leagueMember.leagueId} = ${league.id})
        and not exists (select 1 from ${ssoProviderLeague} where ${ssoProviderLeague.leagueId} = ${league.id})`,
    )
    .returning({ id: league.id })
  return rows.length
}

export async function kickMember(
  db: AppDatabase,
  opts: { leagueId: string; actorUserId: string; targetUserId: string },
): Promise<void> {
  if (opts.actorUserId === opts.targetUserId) throw new ValidationError('use leave to remove yourself')
  const actor = await getMembership(db, opts.leagueId, opts.actorUserId)
  const target = await getMembership(db, opts.leagueId, opts.targetUserId)
  if (!target) throw new NotFoundError('not a member of this league')
  if (!canKick(actor?.role, target.role)) throw new ForbiddenError('insufficient league role')
  await removeMembership(db, opts.leagueId, opts.targetUserId)
}

// Shared by leave, kick and admin removal: drop the row and remember the exit
// so SSO auto-join cannot undo it. The rank snapshot goes too - a re-join
// must not resurrect a months-old movement arrow.
export async function removeMembership(db: AppDatabase, leagueId: string, userId: string): Promise<void> {
  // Atomic: the opt-out row is the invariant that stops SSO auto-join from
  // silently re-adding a user who just left/was kicked.
  await db.transaction(async (tx) => {
    await tx.delete(leagueMember).where(and(eq(leagueMember.leagueId, leagueId), eq(leagueMember.userId, userId)))
    await tx.insert(leagueOptOut).values({ leagueId, userId }).onConflictDoNothing()
    await tx
      .delete(leagueLeaderboardRank)
      .where(and(eq(leagueLeaderboardRank.leagueId, leagueId), eq(leagueLeaderboardRank.userId, userId)))
  })
}

export async function setMemberRole(
  db: AppDatabase,
  opts: { leagueId: string; targetUserId: string; role: 'MEMBER' | 'MODERATOR' },
): Promise<void> {
  const target = await getMembership(db, opts.leagueId, opts.targetUserId)
  if (!target) throw new NotFoundError('not a member of this league')
  if (target.role === 'OWNER') throw new ConflictError('transfer ownership instead of demoting the owner')
  await db
    .update(leagueMember)
    .set({ role: opts.role })
    .where(and(eq(leagueMember.leagueId, opts.leagueId), eq(leagueMember.userId, opts.targetUserId)))
}

export async function transferOwnership(
  db: AppDatabase,
  opts: { leagueId: string; fromUserId: string; toUserId: string },
): Promise<void> {
  if (opts.fromUserId === opts.toUserId) throw new ValidationError('already the owner')
  await db.transaction(async (tx) => {
    await tx
      .update(leagueMember)
      .set({ role: 'MODERATOR' })
      .where(and(eq(leagueMember.leagueId, opts.leagueId), eq(leagueMember.userId, opts.fromUserId)))
    // Promote inside the tx and assert it took: if the target left between the
    // pre-check and here, roll back so the league is never left ownerless.
    const promoted = await tx
      .update(leagueMember)
      .set({ role: 'OWNER' })
      .where(and(eq(leagueMember.leagueId, opts.leagueId), eq(leagueMember.userId, opts.toUserId)))
      .returning({ userId: leagueMember.userId })
    if (promoted.length === 0) throw new NotFoundError('not a member of this league')
  })
}

export async function regenerateJoinCode(db: AppDatabase, leagueId: string, codeGen?: JoinCodeGenerator): Promise<string> {
  const gen = codeGen ?? generateJoinCode
  for (let attempt = 1; ; attempt++) {
    try {
      const rows = await db
        .update(league)
        .set({ joinCode: gen() })
        .where(eq(league.id, leagueId))
        .returning({ joinCode: league.joinCode })
      if (!rows[0]) throw new NotFoundError('league not found')
      return rows[0].joinCode
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_CODE_ATTEMPTS) throw error
    }
  }
}

export async function renameLeague(db: AppDatabase, leagueId: string, name: string): Promise<void> {
  const rows = await db.update(league).set({ name }).where(eq(league.id, leagueId)).returning({ id: league.id })
  if (!rows[0]) throw new NotFoundError('league not found')
}

export async function setLeagueVisibility(db: AppDatabase, leagueId: string, visibility: LeagueVisibility): Promise<void> {
  const rows = await db.update(league).set({ visibility }).where(eq(league.id, leagueId)).returning({ id: league.id })
  if (!rows[0]) throw new NotFoundError('league not found')
}

export async function deleteLeague(db: AppDatabase, leagueId: string): Promise<void> {
  const rows = await db.delete(league).where(eq(league.id, leagueId)).returning({ id: league.id })
  if (!rows[0]) throw new NotFoundError('league not found')
}

export async function dismissLeaguePrompt(db: AppDatabase, userId: string): Promise<void> {
  await stampPromptDismissed(db, userId)
}

// Admin add: overrides a past leave (explicit decision), and assigning OWNER
// demotes the current owner so the single-owner invariant holds.
export async function adminAddMember(
  db: AppDatabase,
  opts: { leagueId: string; userId: string; role?: LeagueRole },
): Promise<void> {
  const row = await getLeague(db, opts.leagueId)
  if (!row) throw new NotFoundError('league not found')
  const userRows = await db.select({ id: user.id }).from(user).where(eq(user.id, opts.userId)).limit(1)
  if (!userRows[0]) throw new NotFoundError('user not found')
  const role = opts.role ?? 'MEMBER'
  await db.transaction(async (tx) => {
    if (role === 'OWNER') {
      await tx
        .update(leagueMember)
        .set({ role: 'MODERATOR' })
        .where(and(eq(leagueMember.leagueId, opts.leagueId), eq(leagueMember.role, 'OWNER')))
    }
    await tx
      .insert(leagueMember)
      .values({ leagueId: opts.leagueId, userId: opts.userId, role })
      .onConflictDoUpdate({ target: [leagueMember.leagueId, leagueMember.userId], set: { role } })
    await tx.delete(leagueOptOut).where(and(eq(leagueOptOut.leagueId, opts.leagueId), eq(leagueOptOut.userId, opts.userId)))
  })
  await stampPromptDismissed(db, opts.userId)
}

export async function setAdminMemberRole(
  db: AppDatabase,
  opts: { leagueId: string; userId: string; role: LeagueRole },
): Promise<void> {
  const target = await getMembership(db, opts.leagueId, opts.userId)
  if (!target) throw new NotFoundError('not a member of this league')
  await db.transaction(async (tx) => {
    if (opts.role === 'OWNER') {
      await tx
        .update(leagueMember)
        .set({ role: 'MODERATOR' })
        .where(and(eq(leagueMember.leagueId, opts.leagueId), eq(leagueMember.role, 'OWNER')))
    }
    await tx
      .update(leagueMember)
      .set({ role: opts.role })
      .where(and(eq(leagueMember.leagueId, opts.leagueId), eq(leagueMember.userId, opts.userId)))
  })
}

export async function assertLeaguesExist(db: AppDatabase, leagueIds: string[]): Promise<void> {
  if (leagueIds.length === 0) return
  const rows = await db.select({ id: league.id }).from(league).where(inArray(league.id, leagueIds))
  if (rows.length !== new Set(leagueIds).size) throw new ValidationError('unknown league id')
}

// For league-scoped live pushes: every league of the user in the competition,
// with the full member list of each (delivery targets).
export async function listCoMemberIdsByLeague(
  db: AppDatabase,
  opts: { userId: string; competitionId: string },
): Promise<Map<string, string[]>> {
  const mine = alias(leagueMember, 'lm_mine')
  const rows = await db
    .select({ leagueId: leagueMember.leagueId, userId: leagueMember.userId })
    .from(mine)
    .innerJoin(league, and(eq(league.id, mine.leagueId), eq(league.competitionId, opts.competitionId)))
    .innerJoin(leagueMember, eq(leagueMember.leagueId, mine.leagueId))
    .where(eq(mine.userId, opts.userId))
  const map = new Map<string, string[]>()
  for (const r of rows) map.set(r.leagueId, [...(map.get(r.leagueId) ?? []), r.userId])
  return map
}

export async function shareLeague(db: AppDatabase, userIdA: string, userIdB: string): Promise<boolean> {
  const a = alias(leagueMember, 'lm_a')
  const b = alias(leagueMember, 'lm_b')
  const rows = await db
    .select({ leagueId: a.leagueId })
    .from(a)
    .innerJoin(b, eq(b.leagueId, a.leagueId))
    .where(and(eq(a.userId, userIdA), eq(b.userId, userIdB)))
    .limit(1)
  return rows.length > 0
}

// Profile gate for profilePrivate users: themselves, admins, and league mates.
export async function canViewProfile(
  db: AppDatabase,
  opts: { viewerId: string | null; targetUserId: string; isAdmin?: boolean },
): Promise<boolean> {
  if (opts.isAdmin || (opts.viewerId !== null && opts.viewerId === opts.targetUserId)) return true
  const rows = await db
    .select({ profilePrivate: user.profilePrivate })
    .from(user)
    .where(eq(user.id, opts.targetUserId))
    .limit(1)
  if (!rows[0]) return false
  if (!rows[0].profilePrivate) return true
  if (!opts.viewerId) return false
  return shareLeague(db, opts.viewerId, opts.targetUserId)
}

export interface AdminLeagueRow {
  id: string
  name: string
  visibility: LeagueVisibility
  joinCode: string
  memberCount: number
  competition: { id: string; slug: string; name: string }
  owner: { userId: string; name: string } | null
  autoJoinProviderIds: string[]
  createdAt: Date
}

export async function listLeaguesAdmin(db: AppDatabase, competitionId?: string): Promise<AdminLeagueRow[]> {
  const memberCount = db.$count(leagueMember, eq(leagueMember.leagueId, league.id))
  const rows = await db
    .select({
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      joinCode: league.joinCode,
      createdAt: league.createdAt,
      memberCount,
      competitionId: competition.id,
      competitionSlug: competition.slug,
      competitionName: competition.name,
    })
    .from(league)
    .innerJoin(competition, eq(competition.id, league.competitionId))
    .where(competitionId ? eq(league.competitionId, competitionId) : undefined)
    .orderBy(asc(competition.slug), asc(league.name))
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const owners = await db
    .select({ leagueId: leagueMember.leagueId, userId: leagueMember.userId, name: user.name })
    .from(leagueMember)
    .innerJoin(user, eq(user.id, leagueMember.userId))
    .where(and(inArray(leagueMember.leagueId, ids), eq(leagueMember.role, 'OWNER')))
  const links = await db
    .select({ leagueId: ssoProviderLeague.leagueId, providerId: ssoProviderLeague.providerId })
    .from(ssoProviderLeague)
    .where(inArray(ssoProviderLeague.leagueId, ids))
  const ownerByLeague = new Map(owners.map((o) => [o.leagueId, { userId: o.userId, name: o.name }]))
  const providersByLeague = new Map<string, string[]>()
  for (const l of links) providersByLeague.set(l.leagueId, [...(providersByLeague.get(l.leagueId) ?? []), l.providerId])
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    visibility: r.visibility as LeagueVisibility,
    joinCode: r.joinCode,
    memberCount: Number(r.memberCount),
    competition: { id: r.competitionId, slug: r.competitionSlug, name: r.competitionName },
    owner: ownerByLeague.get(r.id) ?? null,
    autoJoinProviderIds: providersByLeague.get(r.id) ?? [],
    createdAt: r.createdAt,
  }))
}

// Admin-created league, optionally ownerless (auto-join leagues run fine
// without an OWNER; moderation falls to site admins).
export async function adminCreateLeague(
  db: AppDatabase,
  opts: { competitionId: string; name: string; visibility?: LeagueVisibility; ownerId?: string; codeGen?: JoinCodeGenerator },
): Promise<LeagueRow> {
  if (opts.ownerId) {
    const owner = await db.select({ id: user.id }).from(user).where(eq(user.id, opts.ownerId)).limit(1)
    if (!owner[0]) throw new NotFoundError('user not found')
    return createLeague(db, { ...opts, ownerId: opts.ownerId })
  }
  const codeGen = opts.codeGen ?? generateJoinCode
  for (let attempt = 1; ; attempt++) {
    try {
      const [row] = await db
        .insert(league)
        .values({
          competitionId: opts.competitionId,
          name: opts.name,
          visibility: opts.visibility ?? 'PRIVATE',
          joinCode: codeGen(),
        })
        .returning()
      return row as LeagueRow
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= MAX_CODE_ATTEMPTS) throw error
    }
  }
}

// Replace-set semantics: the form sends the full list each save.
export async function setProviderAutoJoinLeagues(db: AppDatabase, providerId: string, leagueIds: string[]): Promise<void> {
  const provider = await db
    .select({ providerId: ssoProvider.providerId })
    .from(ssoProvider)
    .where(eq(ssoProvider.providerId, providerId))
    .limit(1)
  if (!provider[0]) throw new NotFoundError('provider not found')
  await assertLeaguesExist(db, leagueIds)
  const unique = [...new Set(leagueIds)]
  await db.transaction(async (tx) => {
    await tx.delete(ssoProviderLeague).where(eq(ssoProviderLeague.providerId, providerId))
    if (unique.length > 0) {
      await tx.insert(ssoProviderLeague).values(unique.map((leagueId) => ({ providerId, leagueId })))
    }
  })
}

export async function listProviderAutoJoinLeagues(db: AppDatabase): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ providerId: ssoProviderLeague.providerId, leagueId: ssoProviderLeague.leagueId })
    .from(ssoProviderLeague)
  const map = new Map<string, string[]>()
  for (const r of rows) map.set(r.providerId, [...(map.get(r.providerId) ?? []), r.leagueId])
  return map
}
