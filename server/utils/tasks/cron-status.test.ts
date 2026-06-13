import { describe, it, expect } from 'vitest'
import { buildCronTaskRows, type TaskRunRecord } from './cron-status'
import { TASKS } from './registry'

const NOW = new Date('2026-06-13T12:01:30Z')

function record(over: Partial<TaskRunRecord> & { taskName: string }): TaskRunRecord {
  return { lastRunAt: null, lastFailureAt: null, lastDurationMs: null, lastResult: null, lastError: null, executions: 0, ...over }
}

describe('buildCronTaskRows', () => {
  it('emits one row per registered task, in registry order', () => {
    const rows = buildCronTaskRows([], NOW)
    expect(rows.map((r) => r.name)).toEqual(TASKS.map((t) => t.name))
  })

  it('marks a task with no recorded run as never, with zero executions', () => {
    const row = buildCronTaskRows([], NOW).find((r) => r.name === 'scores:poll')!
    expect(row.status).toBe('never')
    expect(row.executions).toBe(0)
    expect(row.previousRunAt).toBeNull()
    expect(row.lastResult).toBeNull()
  })

  it('computes the next run for a scheduled task and null for a manual one', () => {
    const rows = buildCronTaskRows([], NOW)
    const poll = rows.find((r) => r.name === 'scores:poll')!
    // */2 from 12:01:30 -> 12:02:00
    expect(poll.schedule).toBe('*/2 * * * *')
    expect(poll.nextRunAt).toBe('2026-06-13T12:02:00.000Z')
    const backfill = rows.find((r) => r.name === 'odds:backfill')!
    expect(backfill.schedule).toBeNull()
    expect(backfill.nextRunAt).toBeNull()
  })

  it('is ok when the last run is a success after any failure', () => {
    const row = buildCronTaskRows(
      [record({ taskName: 'scores:poll', lastRunAt: new Date('2026-06-13T12:00:00Z'), lastFailureAt: new Date('2026-06-13T11:50:00Z'), lastDurationMs: 42, lastResult: '{"changed":2}', executions: 7 })],
      NOW,
    ).find((r) => r.name === 'scores:poll')!
    expect(row.status).toBe('ok')
    expect(row.previousRunAt).toBe('2026-06-13T12:00:00.000Z')
    expect(row.lastDurationMs).toBe(42)
    expect(row.executions).toBe(7)
  })

  it('is failed when the most recent event is a failure, and previous tracks it', () => {
    const row = buildCronTaskRows(
      [record({ taskName: 'matches:finalize', lastRunAt: new Date('2026-06-13T11:00:00Z'), lastFailureAt: new Date('2026-06-13T12:00:00Z'), lastError: 'boom' })],
      NOW,
    ).find((r) => r.name === 'matches:finalize')!
    expect(row.status).toBe('failed')
    expect(row.previousRunAt).toBe('2026-06-13T12:00:00.000Z')
    expect(row.lastError).toBe('boom')
  })
})
