import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { user } from '../../../db/schema'
import type { NotificationData } from '../../../shared/types/notifications'
import { categoryForType, isPushEnabled, type PushCategory, type PushPrefs } from './prefs'
import { notificationPushContent, type PushContent } from './content'
import { deleteSubscriptionByEndpoint, listSubscriptions } from './service'

let configured = false

// Read from process.env (not useRuntimeConfig) so this stays a no-op in unit
// tests / non-Nitro contexts: push is simply disabled when the keys are unset.
function vapid() {
  return {
    publicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.NUXT_VAPID_PRIVATE_KEY ?? '',
    subject: process.env.NUXT_VAPID_SUBJECT ?? '',
  }
}

export function pushConfigured(): boolean {
  const v = vapid()
  return !!(v.publicKey && v.privateKey && v.subject)
}

function ensureConfigured(): boolean {
  if (configured) return true
  if (!pushConfigured()) return false
  const v = vapid()
  webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey)
  configured = true
  return true
}

interface UserPushPrefs extends PushPrefs {
  locale: string | null
}

async function getUserPushPrefs(db: AppDatabase, userId: string): Promise<UserPushPrefs | null> {
  const rows = await db
    .select({
      locale: user.locale,
      pushReminders: user.pushReminders,
      pushKickoff: user.pushKickoff,
      pushGoals: user.pushGoals,
      pushMatchResults: user.pushMatchResults,
      pushTournament: user.pushTournament,
      pushLeague: user.pushLeague,
      pushMentions: user.pushMentions,
      pushDm: user.pushDm,
      pushCalls: user.pushCalls,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0] ?? null
}

// Deliver to all of a user's subscriptions, pruning any the push service
// rejects as gone (404/410). Best-effort: a failed send never throws.
async function deliver(db: AppDatabase, userId: string, content: PushContent): Promise<number> {
  const subs = await listSubscriptions(db, userId)
  if (subs.length === 0) return 0
  const json = JSON.stringify(content)
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json)
      sent += 1
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await deleteSubscriptionByEndpoint(db, s.endpoint)
    }
  }
  return sent
}

// Push to one user, gated on config + the user's category toggle. The content is
// built lazily with the user's locale so it's only resolved once we know we're
// sending. No-op (0) when push is unconfigured, the toggle is off, or there are
// no subscriptions - safe to fire-and-forget.
export async function pushToUser(
  db: AppDatabase,
  userId: string,
  category: PushCategory,
  build: (locale: string | null) => PushContent,
): Promise<number> {
  if (!ensureConfigured()) return 0
  const prefs = await getUserPushPrefs(db, userId)
  if (!isPushEnabled(prefs, category)) return 0
  return deliver(db, userId, build(prefs?.locale ?? null))
}

// Push for a stored notification (the createNotification hook): the category and
// content derive from the notification type.
export function pushNotification(db: AppDatabase, userId: string, data: NotificationData): Promise<number> {
  return pushToUser(db, userId, categoryForType(data.type), (locale) => notificationPushContent(data, locale))
}
