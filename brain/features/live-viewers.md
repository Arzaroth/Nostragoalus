# Live viewers ("N watching now")

A live match page shows a real-time count of how many people are on that match
right now. Per-match presence, built on the [WebSocket
hub](../architecture/realtime.md). Back to the catalog: [index.md](index.md).

## What the user sees

Under the scoreline, only while the match is in play (`LIVE`/`PAUSED`) and the
count is above zero: a pulsing dot and "N watching now" (pluralized,
[all five locales](../architecture/i18n.md)). Rendered by
`app/components/MatchViewers.vue` (presentational - the page owns the
live/count gate).

## How it works

- **Counting** lives in `server/utils/live/viewers.ts` - a pure, in-process
  module (under the [98% gate](../architecture/testing.md)): `Map<matchId,
  Set<socket>>` rooms plus a reverse `Map<socket, Set<matchId>>` so a fresh
  report diffs against the previous one. `setViewing` / `removeViewer` return the
  matchIds whose count changed; `viewerCount` / `viewersOf` read it. It never
  sends - the hub does.
- **A dedicated `viewing` frame, not `subscribe`.** A socket on the detail page
  sends `{ type: 'viewing', matchId }` (`app/composables/useMatchPresence.ts`).
  This is deliberately separate from the `subscribe` score frame that
  `useLiveMatch` / `useLiveMatches` send: the fixtures list subscribes to *every*
  visible match for score patches, so counting `subscribe` would make every list
  browser a "viewer" of every match. Only the detail page sends `viewing`, so the
  count means "people actually on this match".
- **De-dupe by socket.** One socket counts once however many times it reports
  (re-sends on reconnect are no-ops). Distinct tabs count separately - this is
  socket-level, unlike the user-level ref-counting in
  [presence](../architecture/realtime.md).
- **Fan-out.** `server/utils/live/hub.ts` `syncMatchViewers` (on a `viewing`
  frame) and `dropMatchViewer` (on disconnect) push `{ type: 'viewers:update',
  matchId, count }` to everyone in that match's room. On disconnect the socket
  leaves the subscriber set *before* the drop, so the decremented count reaches
  the remaining viewers, not the one leaving. A match whose last viewer left has
  an empty room, so nobody is notified - correct.

## Single-instance caveat

The hub is in-process, so the count is **per-node**: across a multi-node deploy
each instance counts only its own sockets and the page would show an undercount.
This is the same limit as the rest of the hub (the app is single-instance today,
see [../decisions.md](../decisions.md)). Scaling out needs a shared store or
pub/sub for the rooms - tracked in [../../TODO.md](../../TODO.md). Not solved now.

## Sources

- `server/utils/live/viewers.ts` (+ `viewers.test.ts`), `server/utils/live/hub.ts`
- `server/routes/_ws.ts` (the `viewing` frame + disconnect drop)
- `app/composables/useMatchPresence.ts`, `app/components/MatchViewers.vue`
- `app/pages/[competition]/matches/[id].vue` (the gated display)
