// Per-match "N watching now" rooms. A socket on a match page reports the match
// it is viewing (a `viewing` frame, distinct from the score `subscribe` the
// fixtures list also sends, which would otherwise count every list browser into
// every match). This module is the pure, in-process bookkeeping: which sockets
// are in which room, kept correct across join, leave and disconnect, de-duped by
// socket. The hub fans the resulting counts out; this file never sends.
//
// In-process only: the count is per-instance and would undercount across a
// multi-node deploy (see brain/features/live-viewers.md). Matches the hub model.

// A socket identity. Any stable object reference works as the de-dupe key; the
// hub passes its LiveSubscriber, tests pass plain objects.
export type ViewerToken = object

// matchId -> the sockets currently viewing it.
const rooms = new Map<string, Set<ViewerToken>>()
// socket -> the matches it is currently counted in, so a fresh report can be
// diffed against the previous one without scanning every room.
const viewing = new Map<ViewerToken, Set<string>>()

function leaveRoom(matchId: string, token: ViewerToken): void {
  const room = rooms.get(matchId)
  if (!room) return
  room.delete(token)
  // Drop empty rooms so viewerCount falls back to 0 and the map doesn't grow
  // unbounded over a tournament.
  if (room.size === 0) rooms.delete(matchId)
}

// Set the exact set of matches a socket is viewing (an empty set clears it).
// Returns the matchIds whose viewer count changed, so the caller broadcasts a
// fresh count for only those. Re-reporting the same set is a no-op (the
// per-socket de-dupe: one socket counts once however many times it reports).
export function setViewing(token: ViewerToken, matchIds: Iterable<string>): string[] {
  const next = new Set(matchIds)
  const prev = viewing.get(token) ?? new Set<string>()
  const changed: string[] = []
  for (const id of next) {
    if (prev.has(id)) continue
    let room = rooms.get(id)
    if (!room) {
      room = new Set<ViewerToken>()
      rooms.set(id, room)
    }
    room.add(token)
    changed.push(id)
  }
  for (const id of prev) {
    if (next.has(id)) continue
    leaveRoom(id, token)
    changed.push(id)
  }
  if (next.size) viewing.set(token, next)
  else viewing.delete(token)
  return changed
}

// A socket disconnected: drop it from every room it was in. Returns the affected
// matchIds so the caller can push the decremented counts to the remaining
// viewers. Unknown tokens (never viewed anything) are a no-op.
export function removeViewer(token: ViewerToken): string[] {
  const prev = viewing.get(token)
  if (!prev) return []
  const changed = [...prev]
  for (const id of prev) leaveRoom(id, token)
  viewing.delete(token)
  return changed
}

export function viewerCount(matchId: string): number {
  return rooms.get(matchId)?.size ?? 0
}

// The sockets currently viewing a match, for the hub's fan-out. A snapshot array
// so the caller can send without iterating live room state.
export function viewersOf(matchId: string): ViewerToken[] {
  const room = rooms.get(matchId)
  return room ? [...room] : []
}

// Exposed for tests: drop all room state.
export function __resetViewers(): void {
  rooms.clear()
  viewing.clear()
}
