import { randomBytes } from 'node:crypto'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, league, leagueInvite, leagueMember } from '../../../db/schema'
import { ConflictError, NotFoundError } from '../errors'
import type { LeagueRole } from './permissions'
import { addMembership, getMembership, type JoinResult } from './service'

export type InviteStatus = 'VALID' | 'EXPIRED' | 'EXHAUSTED'

export interface InviteRow {
  id: string
  leagueId: string
  token: string
  expiresAt: Date | null
  maxUses: number | null
  uses: number
  createdAt: Date
}

// 96-bit URL-safe token: unguessable (unlike the short join code), so the
// link alone is the credential.
export const newInviteToken = () => randomBytes(12).toString('base64url')

export function inviteStatus(invite: Pick<InviteRow, 'expiresAt' | 'maxUses' | 'uses'>, now: Date = new Date()): InviteStatus {
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'EXPIRED'
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return 'EXHAUSTED'
  return 'VALID'
}

export interface CreateInviteOptions {
  leagueId: string
  createdBy: string
  expiresInHours?: number | null
  maxUses?: number | null
}

export async function createInvite(db: AppDatabase, opts: CreateInviteOptions, now: Date = new Date()): Promise<InviteRow> {
  const [row] = await db
    .insert(leagueInvite)
    .values({
      leagueId: opts.leagueId,
      token: newInviteToken(),
      createdBy: opts.createdBy,
      expiresAt: opts.expiresInHours ? new Date(now.getTime() + opts.expiresInHours * 3_600_000) : null,
      maxUses: opts.maxUses ?? null,
    })
    .returning()
  return row
}

export async function listInvites(db: AppDatabase, leagueId: string): Promise<InviteRow[]> {
  return db.select().from(leagueInvite).where(eq(leagueInvite.leagueId, leagueId)).orderBy(desc(leagueInvite.createdAt))
}

export async function revokeInvite(db: AppDatabase, leagueId: string, inviteId: string): Promise<void> {
  const rows = await db
    .delete(leagueInvite)
    .where(and(eq(leagueInvite.id, inviteId), eq(leagueInvite.leagueId, leagueId)))
    .returning({ id: leagueInvite.id })
  if (!rows.length) throw new NotFoundError('invite not found')
}

// Spent invites are noise in the management list and dead rows otherwise;
// callers may prune opportunistically (list route does).
export async function pruneSpentInvites(db: AppDatabase, leagueId: string, now: Date = new Date()): Promise<void> {
  await db
    .delete(leagueInvite)
    .where(
      and(
        eq(leagueInvite.leagueId, leagueId),
        or(
          lt(leagueInvite.expiresAt, now),
          and(sql`${leagueInvite.maxUses} is not null`, sql`${leagueInvite.uses} >= ${leagueInvite.maxUses}`),
        ),
      ),
    )
}

export interface InvitePreview {
  status: InviteStatus
  league: { id: string; name: string; memberCount: number }
  competition: { slug: string; name: string } | null
}

export async function previewInvite(db: AppDatabase, token: string, now: Date = new Date()): Promise<InvitePreview | null> {
  const rows = await db
    .select({ invite: leagueInvite, league, comp: competition })
    .from(leagueInvite)
    .innerJoin(league, eq(leagueInvite.leagueId, league.id))
    .leftJoin(competition, eq(league.competitionId, competition.id))
    .where(eq(leagueInvite.token, token))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leagueMember)
    .where(eq(leagueMember.leagueId, row.league.id))
  return {
    status: inviteStatus(row.invite, now),
    league: { id: row.league.id, name: row.league.name, memberCount: count },
    competition: row.comp ? { slug: row.comp.slug, name: row.comp.name } : null,
  }
}

export async function acceptInvite(
  db: AppDatabase,
  opts: { token: string; userId: string },
  now: Date = new Date(),
): Promise<JoinResult & { role: LeagueRole }> {
  const rows = await db
    .select({ invite: leagueInvite, league })
    .from(leagueInvite)
    .innerJoin(league, eq(leagueInvite.leagueId, league.id))
    .where(eq(leagueInvite.token, opts.token))
    .limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError('invite not found')
  if (inviteStatus(row.invite, now) === 'EXPIRED') throw new ConflictError('invite expired')
  // Membership first: an already-member click must not consume a use.
  if (await getMembership(db, row.league.id, opts.userId)) throw new ConflictError('already a member of this league')
  // Conditional increment is the use-cap gate: two racing accepts of a
  // last-use invite can't both pass (the second matches no row).
  const consumed = await db
    .update(leagueInvite)
    .set({ uses: sql`${leagueInvite.uses} + 1` })
    .where(
      and(
        eq(leagueInvite.id, row.invite.id),
        or(isNull(leagueInvite.maxUses), lt(leagueInvite.uses, leagueInvite.maxUses)),
      ),
    )
    .returning({ id: leagueInvite.id })
  if (!consumed.length) throw new ConflictError('invite exhausted')
  const role = await addMembership(db, row.league.id, opts.userId)
  return { league: row.league, role }
}
