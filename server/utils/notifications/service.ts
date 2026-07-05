import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { userNotification } from '../../../db/schema'
import type { NotificationData, NotificationDTO, NotificationType } from '../../../shared/types/notifications'
import { publishUserNotification } from '../live/hub'
import { pushNotification } from '../push/send'
import { keysetBefore } from '../keyset'

const FEED_LIMIT = 30
const MAX_LIMIT = 100

interface NotificationRow {
  id: string
  type: NotificationType
  data: NotificationData
  readAt: Date | null
  createdAt: Date
}

// A created notification awaiting its live push. Callers that create inside a DB
// transaction collect into one of these and flush after commit, so a rolled-back
// tick never leaves the bell showing a notification that does not exist.
export interface PendingNotification {
  userId: string
  dto: NotificationDTO
}

function toDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    data: row.data,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }
}

// Insert a notification and push it live to the user's open sockets. `dedupeKey`
// (when set) makes the insert idempotent against the per-user partial unique
// index, so a scheduled task re-running can't create a duplicate - the second
// insert is a no-op and returns null (nothing new, nothing to push). Pass
// `collector` when creating inside a transaction: the push is deferred into it
// instead of fired now, so it only reaches sockets if the caller commits.
//
// `refresh` flips a dedupeKey collision from no-op to resurface: the existing row
// is bumped to now (newest-first) with the new data and marked unread again, so a
// grouping key (e.g. one row per DM thread) collapses a burst of events into a
// single, freshly-unread bell entry instead of one row per event.
export async function createNotification(
  db: AppDatabase,
  input: { userId: string; data: NotificationData; dedupeKey?: string; refresh?: boolean },
  collector?: PendingNotification[],
): Promise<NotificationDTO | null> {
  const base = db.insert(userNotification).values({
    userId: input.userId,
    type: input.data.type,
    data: input.data,
    dedupeKey: input.dedupeKey ?? null,
  })
  const q =
    input.refresh && input.dedupeKey
      ? base.onConflictDoUpdate({
          target: [userNotification.userId, userNotification.dedupeKey],
          targetWhere: sql`${userNotification.dedupeKey} is not null`,
          set: { data: input.data, readAt: null, createdAt: new Date() },
        })
      : base.onConflictDoNothing({
          target: [userNotification.userId, userNotification.dedupeKey],
          where: sql`${userNotification.dedupeKey} is not null`,
        })
  const inserted = await q.returning()
  const row = inserted[0] as NotificationRow | undefined
  if (!row) return null
  const dto = toDTO(row)
  if (collector) {
    // Deferred to post-commit flush (which also sends the push).
    collector.push({ userId: input.userId, dto })
  } else {
    publishUserNotification(input.userId, dto)
    // Best-effort web push, fire-and-forget: no-op unless push is configured and
    // the user opted into this category, so it never blocks or fails the insert.
    void pushNotification(db, input.userId, dto.data).catch(() => {})
  }
  return dto
}

export async function listNotifications(
  db: AppDatabase,
  userId: string,
  opts: { limit?: number; before?: Date; beforeId?: string } = {},
): Promise<NotificationDTO[]> {
  const limit = Math.min(opts.limit ?? FEED_LIMIT, MAX_LIMIT)
  // createdAt defaults to the transaction-start time, so every notification minted
  // in one finalize tick shares a timestamp. The id tiebreaker (in both the cursor
  // and the sort) keeps a same-tick page boundary from skipping or repeating rows.
  const cursor = keysetBefore(userNotification.createdAt, userNotification.id, opts.before, opts.beforeId)
  const rows = await db
    .select()
    .from(userNotification)
    .where(and(eq(userNotification.userId, userId), cursor))
    .orderBy(desc(userNotification.createdAt), desc(userNotification.id))
    .limit(limit)
  return (rows as NotificationRow[]).map(toDTO)
}

export async function countUnread(db: AppDatabase, userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userNotification)
    .where(and(eq(userNotification.userId, userId), isNull(userNotification.readAt)))
  return rows[0]?.n ?? 0
}

// Mark the given ids read, scoped to the owner so a user can't touch another's
// rows. Returns how many transitioned (already-read ids are skipped).
export async function markRead(db: AppDatabase, userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const updated = await db
    .update(userNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(userNotification.userId, userId),
        inArray(userNotification.id, ids),
        isNull(userNotification.readAt),
      ),
    )
    .returning({ id: userNotification.id })
  return updated.length
}

export async function markAllRead(db: AppDatabase, userId: string): Promise<number> {
  const updated = await db
    .update(userNotification)
    .set({ readAt: new Date() })
    .where(and(eq(userNotification.userId, userId), isNull(userNotification.readAt)))
    .returning({ id: userNotification.id })
  return updated.length
}

// Owner-scoped hard delete (the bell's per-item dismiss), so a user can't remove
// another's rows. Returns how many were deleted.
export async function deleteNotifications(db: AppDatabase, userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const deleted = await db
    .delete(userNotification)
    .where(and(eq(userNotification.userId, userId), inArray(userNotification.id, ids)))
    .returning({ id: userNotification.id })
  return deleted.length
}

export async function deleteAllNotifications(db: AppDatabase, userId: string): Promise<number> {
  const deleted = await db
    .delete(userNotification)
    .where(eq(userNotification.userId, userId))
    .returning({ id: userNotification.id })
  return deleted.length
}

// Read notifications live this long before the retention sweep drops them; they
// have been seen, so 7 days is plenty to glance back. Unread rows are never
// aged out - only bounded by the per-user cap.
export const READ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const PER_USER_CAP = 200

// Retention sweep (the notifications:prune task). PICK_REMINDER has its own
// lifecycle (it self-prunes at kickoff/on pick), so this only bounds the rest.
export async function pruneNotifications(
  db: AppDatabase,
  now: Date = new Date(),
  opts: { readTtlMs?: number; perUserCap?: number } = {},
): Promise<{ aged: number; capped: number }> {
  const readTtlMs = opts.readTtlMs ?? READ_RETENTION_MS
  const cap = opts.perUserCap ?? PER_USER_CAP

  const readCutoff = new Date(now.getTime() - readTtlMs)
  const aged = await db
    .delete(userNotification)
    .where(and(isNotNull(userNotification.readAt), lt(userNotification.createdAt, readCutoff)))
    .returning({ id: userNotification.id })

  // Keep only the newest `cap` per user; the bell never pages past ~100 anyway.
  const ranked = db
    .select({
      id: userNotification.id,
      rn: sql<number>`row_number() over (partition by ${userNotification.userId} order by ${userNotification.createdAt} desc)`.as(
        'rn',
      ),
    })
    .from(userNotification)
    .as('ranked')
  const overflow = await db.select({ id: ranked.id }).from(ranked).where(sql`${ranked.rn} > ${cap}`)
  let capped = 0
  if (overflow.length > 0) {
    const removed = await db
      .delete(userNotification)
      .where(
        inArray(
          userNotification.id,
          overflow.map((o) => o.id),
        ),
      )
      .returning({ id: userNotification.id })
    capped = removed.length
  }

  return { aged: aged.length, capped }
}
