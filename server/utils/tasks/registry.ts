// Single source of truth for the background tasks: their cron schedule (null =
// manual-only) and whether a manual run is fire-and-forget (the odds tasks sit
// behind a 5s/call limiter and run for minutes, longer than a proxy timeout).
// nuxt.config builds its scheduledTasks map from this; the admin cron view reads
// the schedule and the run endpoint validates against it.
export interface TaskDef {
  name: string
  cron: string | null
  fireAndForget: boolean
}

export const TASKS: TaskDef[] = [
  // Live score polling self-gates on the live window, so off-window ticks make no API calls.
  { name: 'scores:poll', cron: '*/2 * * * *', fireAndForget: false },
  // Hourly fixture/bracket refresh.
  { name: 'fixtures:refresh', cron: '0 * * * *', fireAndForget: false },
  // Lock predictions at kickoff and score finished matches.
  { name: 'matches:finalize', cron: '*/5 * * * *', fireAndForget: false },
  // Odds snapshots self-gate on per-match staleness, so most ticks are no-ops.
  { name: 'odds:refresh', cron: '*/30 * * * *', fireAndForget: true },
  // Daily cleanup of never-confirmed accounts (self-gates: no-op unless email
  // verification is required).
  { name: 'users:prune-unverified', cron: '17 4 * * *', fireAndForget: false },
  // Remind active predictors of matches locking within ~3h they haven't picked,
  // and prune reminders for matches that have kicked off. Cheap off-window (the
  // windowed scan returns nothing), so a plain cron with no live-window gate.
  { name: 'notifications:pick-reminders', cron: '*/15 * * * *', fireAndForget: false },
  // One-shot historical odds backfill, manual only.
  { name: 'odds:backfill', cron: null, fireAndForget: true },
  // One-shot fixture import from the providers, manual only.
  { name: 'fixtures:import', cron: null, fireAndForget: true },
  // One-shot champion FIFA-rank backfill, manual only. Awaited (one fetch + a
  // batch update) so the run returns its summary to the admin result dialog.
  { name: 'champion:backfill-ranks', cron: null, fireAndForget: false },
]

const BY_NAME = new Map(TASKS.map((t) => [t.name, t]))
export const findTask = (name: string): TaskDef | undefined => BY_NAME.get(name)

// Nitro scheduledTasks map: cron expression -> task names sharing it.
export function scheduledTasksMap(tasks: TaskDef[] = TASKS): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const t of tasks) {
    if (!t.cron) continue
    ;(map[t.cron] ??= []).push(t.name)
  }
  return map
}
