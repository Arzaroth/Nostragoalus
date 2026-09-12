// Nitro schedules tasks with `new Cron(expr, fn)` and does not pass croner's
// `protect` option, whose default is off - so if a run outlasts its interval,
// the next tick fires anyway and the two overlap. That was academic while the
// live poll ran every two minutes. It is not once the interval is shorter than
// a slow tick: two concurrent `scores:poll` runs would double the requests to
// the providers, race each other on the per-match read-then-write in
// upsertMatches, and hand notifyLiveMatchEvents the same goal twice - which
// reaches users as duplicate push notifications.
//
// In-process, like the rest of the task state. A second app instance would run
// its own poll regardless of this, which is a property of the current
// single-instance deployment rather than something this guard changes.
const inFlight = new Set<string>()

// Runs `fn` unless a run under the same name is still going, in which case the
// tick is skipped. The skip is reported rather than swallowed so a run that is
// persistently too slow for its schedule shows up in the task_run history
// instead of looking like a healthy tick.
export async function withoutOverlap<T>(name: string, fn: () => Promise<T>): Promise<T | { result: 'busy' }> {
  if (inFlight.has(name)) return { result: 'busy' }
  inFlight.add(name)
  try {
    return await fn()
  } finally {
    inFlight.delete(name)
  }
}

export function clearInFlightTasks(): void {
  inFlight.clear()
}
