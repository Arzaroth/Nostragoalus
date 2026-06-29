# Realtime

Live updates (scores, chat, presence, notifications, crowd totals) ride a single
Nitro WebSocket. There is no SSE and no external broker: the hub is in-process,
which is why the app is single-instance today (see
[../decisions.md](../decisions.md)).

## The socket

- Endpoint `/_ws`, handled by `server/routes/_ws.ts`.
- The user's session is resolved once, at socket open, and pinned to that
  connection. All later authorization (which league rooms a socket may receive)
  is gated against that resolved identity, so a client cannot subscribe itself
  into a league it is not a member of.

## The live hub

`server/utils/live/hub.ts` is the in-process fan-out. It tracks connected sockets
and exposes typed publish helpers that the rest of the server calls
fire-and-forget after a successful mutation or during a scheduled task.

| Publisher | Targets | Used by |
|---|---|---|
| `publishUserNotification(userId, dto)` | that user's own sockets | [../features/notifications.md](../features/notifications.md) |
| `publishCrowdUpdate(...)` | match subscribers (optionally league-scoped) | [../features/crowd-bot.md](../features/crowd-bot.md) |
| `publishLeagueReactionUpdate(...)` | league members | [../features/chat.md](../features/chat.md), reactions |
| `publishMemberNameChanged(...)` | affected leagues (`chat:roster`) | [../features/chat.md](../features/chat.md) |
| presence broadcasts | all sockets / a new socket | presence, below |
| `syncMatchViewers` / `dropMatchViewer` | a match's viewer room (`viewers:update`) | [../features/live-viewers.md](../features/live-viewers.md) |
| score/match updates | the live match view | `scores:poll`, [providers.md](providers.md) |

## Live event types (client message names)

- `chat:new` - a new message (replies ride this too and bump the parent thread
  count); `chat:moderation` - hide/restore/pending; `chat:roster` - member name
  change (keyed by `leagueIds`, handled BEFORE the per-room leagueId guard);
  `chat:state-changed` - chat turned off / key rotated.
- `notification:new` - a new in-app notification.
- `presence:update` (a user's online/idle state changed), `presence:snapshot`
  (full state sent to a freshly connected socket), `presence:ping` (client ->
  server idle keepalive).
- `viewing` (client -> server: the one match this socket is on) and
  `viewers:update` (server -> a match's viewer room: the new "N watching now"
  count). Per-match presence, distinct from the global `presence:*` and from the
  `subscribe` score frame - see [../features/live-viewers.md](../features/live-viewers.md).
- crowd totals update and live score/match updates.

## Client side

### `useReconnectingSocket`

The single managed connection. Exponential backoff 1s -> 30s (capped),
force-reconnect on `visibilitychange` (tab refocus) and the `online` event. Its
`onOpen` fires on connect AND on every reconnect, which is the hook to
re-subscribe and refetch so the cache heals after a drop.

### `usePresence`

A singleton (detached effect scope) started app-wide from `layouts/default.vue`.
It uses `@vueuse` `useIdle` (15 minutes) to flag idle and pings the server. The
server keeps a ref-counted `Map<userId, {connections, idle}>` so a user with
several tabs shows online until the last one closes; a socket that closes
mid-lookup is guarded so it cannot strand a user "online forever". Avatars render
a dot: green = active, amber = idle, none = offline.

## Why mutations heal the cache

A mutation's HTTP response updates the initiating client; the hub push updates
everyone else. Both paths converge on the same vue-query cache keys (see
[client.md](client.md)), so a missed socket frame is corrected by the next
`onOpen` refetch.

## Sources

- `server/routes/_ws.ts`
- `server/utils/live/hub.ts`, `server/utils/live/presence.ts`, `server/utils/live/viewers.ts`
- `app/composables/useReconnectingSocket.ts`, `app/composables/usePresence.ts`, `app/composables/useMatchPresence.ts`
- `app/components/UserAvatar.vue` (presence dot), `app/components/MatchViewers.vue` ("N watching now")
