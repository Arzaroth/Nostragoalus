// The live match header sits directly above the goal event list, and the two must
// agree. They draw from FIFA-backed feeds on different clocks: the goal count off
// the detail/insights feed (~45 s, and the exact source the event list uses) and
// the WS/stored score patched from the football-data poll (~2 min). The old header
// took Math.max of the two, which could never drop when VAR disallowed a goal - the
// stale-high WS side pinned it. Recency arbitration doesn't fix it either: a stale
// WS poll delivering the pre-disallow value looks identical to a fresh goal, so it
// re-raises the score all the same.
//
// The goal feed is strictly fresher than the WS score and is what the event list
// already renders, so once it has landed it is authoritative - a struck-off goal
// drops from the header and the list together, in lockstep. Before it lands, fall
// back to the WS/stored score so the header isn't blank, and 0 as a last resort.
export function liveHeaderScore(feedCount: number, wsScore: number | null, feedReady: boolean): number {
  return feedReady ? feedCount : wsScore ?? 0
}
