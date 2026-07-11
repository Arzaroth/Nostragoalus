// The live match header sits above the goal timeline and pulls its score from two
// FIFA-backed feeds on different clocks: the WS score patched from the
// football-data poll (~2 min) and the goal count derived from the detail/insights
// feed (~45 s, VAR-aware). Neither is authoritative on its own - the WS score
// trails a fresh goal, and a plain Math.max of the two can never drop when VAR
// disallows one (the stale-high WS side pins it). Reconcile by recency instead:
// whichever source moved since the last tick is the fresher truth and wins.

export interface LiveScoreSources {
  // WS/stored score from the football-data poll; null before the first reading.
  ws: number | null
  // Goal count derived from the FIFA detail/insights feed.
  feed: number
  // Whether the goal feed has landed at all. A 0-0 match has feed=0 with
  // feedReady=true; a not-yet-fetched feed also reads 0 but must be ignored so a
  // transient gap can't flicker the score down.
  feedReady: boolean
}

export interface LiveScoreState {
  // The reconciled score to display.
  value: number
  // Last WS reading reconciled against.
  ws: number
  // Last feed reading reconciled against.
  feed: number
}

// Seed a fresh reconciler when a match goes live (or on its first readings). Take
// the higher of the two so opening a match already in play never under-reports.
export function seedLiveScore(sources: LiveScoreSources): LiveScoreState {
  const ws = sources.ws ?? 0
  const feed = sources.feedReady ? sources.feed : 0
  return { value: Math.max(ws, feed), ws, feed }
}

// Recency arbitration without a wall clock: the source that changed since the
// last tick is fresher and wins. A VAR disallow drops the FIFA feed count and it
// wins over the stale-high WS score; a fresh goal on either feed wins over the
// other's lag. When both move in the same tick, trust the faster feed (45 s) over
// WS (2 min). An unready feed is held at its last value so it can't win.
export function reconcileLiveScore(prev: LiveScoreState, sources: LiveScoreSources): LiveScoreState {
  const ws = sources.ws ?? prev.ws
  const feed = sources.feedReady ? sources.feed : prev.feed
  const wsChanged = ws !== prev.ws
  const feedChanged = feed !== prev.feed
  let value = prev.value
  if (feedChanged) value = feed
  else if (wsChanged) value = ws
  return { value, ws, feed }
}
