# Live viewers ("N watching now")

A live match page shows a real-time count of how many people are on that match
right now. Per-match presence, built on the [WebSocket
hub](../architecture/realtime.md). Back to the catalog: [index.md](index.md).

## What the user sees

Under the scoreline, only while the match is in play (`LIVE`/`PAUSED`) and the
count is above zero: a pulsing dot and "N watching now" (pluralized,
[all five locales](../architecture/i18n.md)). Rendered by
`apps/web-nuxt/app/components/MatchViewers.vue` (presentational - the page owns the
live/count gate).

## How it works

- **Counting** lives in `apps/web-nuxt/server/utils/live/viewers.ts` - a pure, in-process
  module (under the [98% gate](../architecture/testing.md)): `Map<matchId,
  Set<socket>>` rooms plus a reverse `Map<socket, Set<matchId>>` so a fresh
  report diffs against the previous one, and a `Map<socket, identity>` recording
  the viewer identity each socket de-dupes on. `setViewing` / `removeViewer`
  return the matchIds whose count changed; `viewerCount` / `viewersOf` read it.
  It never sends - the hub does.
- **A dedicated `viewing` frame, not `subscribe`.** A socket on the detail page
  sends `{ type: 'viewing', matchId }` (`apps/web-nuxt/app/composables/useMatchPresence.ts`).
  This is deliberately separate from the `subscribe` score frame that
  `useLiveMatch` / `useLiveMatches` send: the fixtures list subscribes to *every*
  visible match for score patches, so counting `subscribe` would make every list
  browser a "viewer" of every match. Only the detail page sends `viewing`, so the
  count means "people actually on this match".
- **De-dupe by viewer.** Room membership is per-socket (each socket needs the
  fan-out), but the *count* de-dupes on viewer identity: `setViewing` is passed
  the socket's `userId`, so a logged-in user's multiple tabs on one match count
  once (like the user-level ref-counting in
  [presence](../architecture/realtime.md)). Guests have no `userId`, so they fall
  back to their socket and each guest tab counts separately. Re-sends on reconnect
  are still no-ops.
- **Fan-out.** `apps/web-nuxt/server/utils/live/hub.ts` `syncMatchViewers` (on a `viewing`
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

- `apps/web-nuxt/server/utils/live/viewers.ts` (+ `viewers.test.ts`), `apps/web-nuxt/server/utils/live/hub.ts`
- `apps/web-nuxt/server/routes/_ws.ts` (the `viewing` frame + disconnect drop)
- `apps/web-nuxt/app/composables/useMatchPresence.ts`, `apps/web-nuxt/app/components/MatchViewers.vue`
- `apps/web-nuxt/app/pages/[competition]/matches/[id].vue` (the gated display)
