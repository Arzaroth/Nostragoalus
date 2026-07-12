import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from './db'

describe('pglite test database', () => {
  it('applies the Drizzle migrations and exposes the auth tables', async () => {
    const { db, client } = await createTestDb()

    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )
    const names = (result.rows as { table_name: string }[]).map((r) => r.table_name)

    expect(names).toContain('user')
    expect(names).toContain('session')
    expect(names).toContain('account')

    await client.close()
  })
})
