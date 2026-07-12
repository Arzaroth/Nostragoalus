import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { taskRun } from '../../../db/schema'

// Persist the outcome of a background-task run: success updates last-run fields,
// failure updates last-failure fields - each side preserved across the other -
// and either way the execution counter ticks up.
export async function recordTaskRun<T>(db: AppDatabase, name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    const result = await fn()
    const summary = JSON.stringify(result ?? null).slice(0, 400)
    await db
      .insert(taskRun)
      .values({ taskName: name, lastRunAt: new Date(started), lastDurationMs: Date.now() - started, lastResult: summary, executions: 1 })
      .onConflictDoUpdate({
        target: taskRun.taskName,
        set: { lastRunAt: new Date(started), lastDurationMs: Date.now() - started, lastResult: summary, executions: sql`${taskRun.executions} + 1` },
      })
    return result
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 400)
    await db
      .insert(taskRun)
      .values({ taskName: name, lastFailureAt: new Date(started), lastError: message, executions: 1 })
      .onConflictDoUpdate({ target: taskRun.taskName, set: { lastFailureAt: new Date(started), lastError: message, executions: sql`${taskRun.executions} + 1` } })
    throw error
  }
}
