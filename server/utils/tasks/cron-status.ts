import { Cron } from 'croner'
import { TASKS, type TaskDef } from './registry'

// One row in the persisted task_run table (only the fields the view needs).
export interface TaskRunRecord {
  taskName: string
  lastRunAt: Date | null
  lastFailureAt: Date | null
  lastDurationMs: number | null
  lastResult: string | null
  lastError: string | null
  executions: number
}

export type CronTaskStatus = 'ok' | 'failed' | 'never'

export interface CronTaskRow {
  name: string
  schedule: string | null
  nextRunAt: string | null
  // Most recent run of either kind, for the "Previous Time" column.
  previousRunAt: string | null
  lastRunAt: string | null
  lastFailureAt: string | null
  lastDurationMs: number | null
  executions: number
  lastResult: string | null
  lastError: string | null
  status: CronTaskStatus
}

// croner parses the same expressions Nitro schedules with; a bad pattern just
// yields no next run rather than throwing the request.
function nextRunOf(expr: string, now: Date): string | null {
  try {
    return new Cron(expr).nextRun(now)?.toISOString() ?? null
  } catch {
    return null
  }
}

// Join the static registry with the persisted run history into the rows the
// admin cron view renders. Tasks with no recorded run yet show as 'never'.
export function buildCronTaskRows(runs: TaskRunRecord[], now: Date, tasks: TaskDef[] = TASKS): CronTaskRow[] {
  const byName = new Map(runs.map((r) => [r.taskName, r]))
  return tasks.map((t) => {
    const r = byName.get(t.name)
    const lastRunAt = r?.lastRunAt ?? null
    const lastFailureAt = r?.lastFailureAt ?? null
    const status: CronTaskStatus = !lastRunAt && !lastFailureAt ? 'never' : lastFailureAt && (!lastRunAt || lastFailureAt > lastRunAt) ? 'failed' : 'ok'
    const previous = lastFailureAt && (!lastRunAt || lastFailureAt > lastRunAt) ? lastFailureAt : lastRunAt
    return {
      name: t.name,
      schedule: t.cron,
      nextRunAt: t.cron ? nextRunOf(t.cron, now) : null,
      previousRunAt: previous ? previous.toISOString() : null,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      lastFailureAt: lastFailureAt ? lastFailureAt.toISOString() : null,
      lastDurationMs: r?.lastDurationMs ?? null,
      executions: r?.executions ?? 0,
      lastResult: r?.lastResult ?? null,
      lastError: r?.lastError ?? null,
      status,
    }
  })
}
