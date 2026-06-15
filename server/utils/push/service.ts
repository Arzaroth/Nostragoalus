import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { pushSubscription } from '../../../db/schema'

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface StoredPushSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

// Upsert on the endpoint: a re-subscribe (or a device that moved to another
// account) refreshes the keys and reassigns ownership rather than duplicating.
export async function saveSubscription(
  db: AppDatabase,
  userId: string,
  input: PushSubscriptionInput,
  userAgent?: string | null,
): Promise<void> {
  await db
    .insert(pushSubscription)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent ?? null },
    })
}

// Owner-scoped removal (the client unsubscribing its own endpoint).
export async function deleteSubscription(db: AppDatabase, userId: string, endpoint: string): Promise<number> {
  const removed = await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
    .returning({ id: pushSubscription.id })
  return removed.length
}

// Unscoped removal by endpoint, for pruning a dead endpoint the push service
// rejected (404/410) - the row may belong to any user.
export async function deleteSubscriptionByEndpoint(db: AppDatabase, endpoint: string): Promise<void> {
  await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint))
}

export async function listSubscriptions(db: AppDatabase, userId: string): Promise<StoredPushSubscription[]> {
  return db
    .select({
      id: pushSubscription.id,
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
}
