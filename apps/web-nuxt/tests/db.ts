import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../db/schema'

export type TestDb = ReturnType<typeof drizzle<typeof schema>>

// Replaying every migration costs ~850ms and the suite builds a few hundred test
// databases, so the migration run, not Postgres itself, dominated setup (pglite
// boots in under a millisecond). Migrate once per worker process, snapshot the
// finished database, and restore that snapshot for every later one: ~143ms
// instead of ~1033ms, same schema, same migration bookkeeping table.
//
// The snapshot is a promise so concurrent callers in one process share a single
// migration run rather than racing to build their own. It is dropped again if it
// fails, so one bad run does not poison every test that follows.
let snapshot: Promise<Blob | File> | null = null

async function migratedSnapshot(): Promise<Blob | File> {
  const seed = new PGlite()
  await migrate(drizzle(seed), { migrationsFolder: './drizzle' })
  const dump = await seed.dumpDataDir('none')
  await seed.close()
  return dump
}

export async function createTestDb() {
  if (!snapshot) {
    snapshot = migratedSnapshot().catch((e) => {
      snapshot = null
      throw e
    })
  }
  const client = new PGlite({ loadDataDir: await snapshot })
  const db = drizzle(client, { schema })
  return { db, client }
}
