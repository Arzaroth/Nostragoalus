import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { account, ssoProvider } from '../../../db/schema'

// An account is SSO-managed while it has no local password (credential row)
// AND at least one of its SSO links points at a provider that still exists.
// When the provider is deleted the user stops being managed: they regain
// credential management and can set a password through the reset flow.
export async function isSsoManaged(db: AppDatabase, userId: string): Promise<boolean> {
  const rows = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId))
  if (rows.length === 0 || rows.some((r) => r.providerId === 'credential')) return false
  const providers = await db.select({ providerId: ssoProvider.providerId }).from(ssoProvider)
  const live = new Set(providers.map((p) => p.providerId))
  return rows.some((r) => live.has(r.providerId))
}
