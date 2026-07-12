// Soonest not-yet-started fixture for the signed-out landing teaser. Scans for
// the minimum future kickoff so it doesn't depend on the list's grouping order;
// null when nothing is upcoming.
interface UpcomingMatch {
  status: string
  kickoffTime: string
}

export function pickNextMatch<T extends UpcomingMatch>(matches: T[], nowMs: number): T | null {
  let next: T | null = null
  let nextMs = Infinity
  for (const m of matches) {
    if (m.status !== 'SCHEDULED') continue
    const ms = new Date(m.kickoffTime).getTime()
    if (ms > nowMs && ms < nextMs) {
      next = m
      nextMs = ms
    }
  }
  return next
}
