import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { pushSubscription } from '../../../db/schema'
import { ConflictError } from '../errors'

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

// Upsert on the endpoint: a re-subscribe from the same account refreshes its
// keys rather than duplicating. An endpoint already registered to a DIFFERENT
// account is never reassigned - a hijacker who learns a victim's endpoint URL
// could otherwise flip the row to themselves, silencing the victim and
// redirecting their pushes. The pre-check raises a clear 409; the conditional
// `setWhere` makes the refusal race-proof (the owner can never be flipped at the
// DB level, even under a concurrent claim).
export async function saveSubscription(
  db: AppDatabase,
  userId: string,
  input: PushSubscriptionInput,
  userAgent?: string | null,
): Promise<void> {
  const existing = await db
    .select({ userId: pushSubscription.userId })
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, input.endpoint))
    .limit(1)
  if (existing[0] && existing[0].userId !== userId) {
    throw new ConflictError('push endpoint registered to another account')
  }
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
      setWhere: eq(pushSubscription.userId, userId),
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
