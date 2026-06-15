import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { userNotification } from '../../../db/schema'
import type { NotificationData, NotificationDTO, NotificationType } from '../../../shared/types/notifications'
import { publishUserNotification } from '../live/hub'

const FEED_LIMIT = 30
const MAX_LIMIT = 100

interface NotificationRow {
  id: string
  type: NotificationType
  data: NotificationData
  readAt: Date | null
  createdAt: Date
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
// insert is a no-op and returns null (nothing new, nothing to push).
export async function createNotification(
  db: AppDatabase,
  input: { userId: string; data: NotificationData; dedupeKey?: string },
): Promise<NotificationDTO | null> {
  const inserted = await db
    .insert(userNotification)
    .values({
      userId: input.userId,
      type: input.data.type,
      data: input.data,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({
      target: [userNotification.userId, userNotification.dedupeKey],
      where: sql`${userNotification.dedupeKey} is not null`,
    })
    .returning()
  const row = inserted[0] as NotificationRow | undefined
  if (!row) return null
  const dto = toDTO(row)
  publishUserNotification(input.userId, dto)
  return dto
}

export async function listNotifications(
  db: AppDatabase,
  userId: string,
  opts: { limit?: number; before?: Date } = {},
): Promise<NotificationDTO[]> {
  const limit = Math.min(opts.limit ?? FEED_LIMIT, MAX_LIMIT)
  const scope = opts.before
    ? and(eq(userNotification.userId, userId), lt(userNotification.createdAt, opts.before))
    : eq(userNotification.userId, userId)
  const rows = await db
    .select()
    .from(userNotification)
    .where(scope)
    .orderBy(desc(userNotification.createdAt))
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
