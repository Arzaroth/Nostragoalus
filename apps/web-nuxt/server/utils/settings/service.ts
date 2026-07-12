import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { appSetting } from '../../../db/schema'

// Generic runtime key-value store (admin-toggled flags). String values only;
// callers own the encoding (e.g. boolean <-> 'true'/'false').
export async function getAppSetting(db: AppDatabase, key: string): Promise<string | null> {
  const rows = await db.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, key)).limit(1)
  return rows[0]?.value ?? null
}

export async function setAppSetting(db: AppDatabase, key: string, value: string): Promise<void> {
  await db
    .insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: sql`now()` } })
}

export async function getBoolSetting(db: AppDatabase, key: string, fallback = false): Promise<boolean> {
  const raw = await getAppSetting(db, key)
  return raw === null ? fallback : raw === 'true'
}
