import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { recordTaskRun } from './recorder'
import { taskRun } from '../../../db/schema'

describe('recordTaskRun', () => {
  it('records successes and failures independently, preserving the other side', async () => {
    const { db, client } = await createTestDb()

    expect(await recordTaskRun(db, 'demo', async () => ({ changed: 3 }))).toEqual({ changed: 3 })
    let [row] = await db.select().from(taskRun)
    expect(row.lastResult).toContain('"changed":3')
    expect(row.lastRunAt).not.toBeNull()
    expect(row.lastFailureAt).toBeNull()

    await expect(recordTaskRun(db, 'demo', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    ;[row] = await db.select().from(taskRun)
    expect(row.lastError).toBe('boom')
    expect(row.lastFailureAt).not.toBeNull()
    // the previous successful run is still there
    expect(row.lastResult).toContain('"changed":3')

    // a later success keeps the failure record
    await recordTaskRun(db, 'demo', async () => 'ok')
    ;[row] = await db.select().from(taskRun)
    expect(row.lastResult).toBe('"ok"')
    expect(row.lastError).toBe('boom')
    // every run (2 successes + 1 failure) bumped the counter
    expect(row.executions).toBe(3)

    // non-Error throw is stringified
    await expect(recordTaskRun(db, 'demo2', async () => Promise.reject('raw'))).rejects.toBe('raw')
    const rows = await db.select().from(taskRun)
    expect(rows.find((r) => r.taskName === 'demo2')!.lastError).toBe('raw')
    await client.close()
  })
})

it('records a void result as null', async () => {
  const { db, client } = await createTestDb()
  await recordTaskRun(db, 'void-task', async () => undefined)
  const [row] = await db.select().from(taskRun)
  expect(row.lastResult).toBe('null')
  await client.close()
})
