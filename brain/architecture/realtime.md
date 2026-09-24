# Realtime

Live updates (scores, chat, presence, notifications, crowd totals) ride a single
Nitro WebSocket. There is no SSE and no external broker: the hub is in-process,
which is why the app is single-instance today (see
[../decisions.md](../decisions.md)).

## The socket

- Endpoint `/_ws`, handled by `apps/web-nuxt/server/routes/_ws.ts`.
- The socket is registered synchronously at open (so an early `subscribe` or
  close is not lost), then the user's session is resolved once and pinned to that
  connection (`userId` null for a guest, who still gets the global broadcasts). All later authorization (which league rooms a socket may receive)
  is gated against that resolved identity, so a client cannot subscribe itself
  into a league it is not a member of.

## The live hub

`apps/web-nuxt/server/utils/live/hub.ts` is the in-process fan-out. It tracks connected sockets
and exposes typed publish helpers that the rest of the server calls
fire-and-forget after a successful mutation or during a scheduled task.

| Publisher | Targets | Used by |
|---|---|---|
| `publishUserNotification(userId, dto)` | that user's own sockets | [../features/notifications.md](../features/notifications.md) |
| `publishCrowdUpdate` / `publishLeagueCrowdUpdate` | every socket (`crowd:update`) / league members only (`crowd:league-update`) | [../features/crowd-bot.md](../features/crowd-bot.md) |
| `publishReactionUpdate` / `publishLeagueReactionUpdate` | every socket (`reaction:update`) / league members only (`reaction:league-update`) | match reactions |
| `publishLeagueChatMessage`, `publishChatEdit`, `publishChatReactionUpdate`, `publishChatModeration`, `publishChatStateChanged`, `publishChatRekeyRequest`, `publishChatKeysAdded`, `publishChatTyping`, `publishChatRoster` | league members (one members-only gate in the hub) | [../features/chat.md](../features/chat.md); wrapped with the DB lookups in `live/league-chat.ts` (e.g. `publishMemberNameChanged` -> `chat:roster`) |
| `publishDmMessage`, `publishDmEdit`, `publishDmReaction`, `publishDmTyping` | the two participants (`live/dm-chat.ts` wraps typing) | [../features/dms.md](../features/dms.md) |
| `publishVoiceRoster`, `sendVoiceToToken`, `publishVoiceToUser`, `publishVoicePresence`, `publishVoiceLog` | the one in-call socket / every socket of a user / league members | [webrtc.md](webrtc.md) |
| presence broadcasts | all sockets / a new socket | presence, below |
| `syncMatchViewers` / `dropMatchViewer` | a match's viewer room (`viewers:update`) | [../features/live-viewers.md](../features/live-viewers.md) |
| `publishMatchUpdates` / `sendMatchSnapshot` | subscribers of those matches (`match:update`) + every socket (`scores:changed`) / one re-subscribing socket | `scores:poll`, [providers.md](providers.md) |

## Live event types (client message names)

- `subscribe` (client -> server: the match ids a view shows); the server answers
  with a `match:update` snapshot of each so a transition missed while
  disconnected converges.
- `chat:new` - a new message (replies ride this too and bump the parent thread
  count); `chat:edit` - new ciphertext for an edited message; `chat:reaction` -
  a message's emoji counts; `chat:moderation` - pending/removed/restored;
  `chat:roster` - member name change (keyed by `leagueIds`, handled BEFORE the
  per-room leagueId guard); `chat:state-changed` - chat turned on/off or
  re-keyed; `chat:rekey-request` / `chat:keys-added` - E2EE group-key re-seal
  nudges (no key material); `chat:typing` - a member is composing (client ->
  server with the `leagueId`, server -> the room's other members).
- `dm:new`, `dm:edit`, `dm:reaction` - the DM counterparts, to both
  participants' sockets. `dm:typing` - the typing hint for a 1:1 thread
  (`{threadId}`, capped at 64 chars), authorized through `requireParticipant`
  and delivered only to the other participant. See
  [../features/dms.md](../features/dms.md).
- `notification:new` - a new in-app notification.
- `presence:update` (a user's online/idle state changed), `presence:snapshot`
  (full state sent to a freshly connected socket), `presence:ping` (client ->
  server idle keepalive).
- `viewing` (client -> server: the one match this socket is on) and
  `viewers:update` (server -> a match's viewer room: the new "N watching now"
  count). Per-match presence, distinct from the global `presence:*` and from the
  `subscribe` score frame - see [../features/live-viewers.md](../features/live-viewers.md).
- `ping` (client -> server keepalive) and `pong` (server -> client answer). App-level
  heartbeat, distinct from the `presence:ping` idle report - it detects a silently
  half-open socket (see the heartbeat note under `useReconnectingSocket`).
- `voice:*` - WebRTC call signaling relayed for [voice chat](../features/voice-chat.md).
  Client -> server: `voice:join`/`voice:leave`, `voice:signal`, `voice:invite`,
  `voice:decline`, `voice:cancel`. Server -> client: `voice:signal` (SDP/ICE
  relayed between two members of a room), `voice:ring`, `voice:declined`,
  `voice:cancelled`, `voice:ended` (a DM call hung up for the other side),
  `voice:roster` (a room's participants), `voice:presence` (a league room's count to
  all members, for the "N in voice" badge), `voice:log` (a call-log line changed:
  open chats refetch), `voice:evicted` (to the old tab on a takeover) and
  `voice:peer-reset` (the other members re-establish their peer connection to the
  user who re-joined from a new tab). The media itself is peer-to-peer, not
  on this socket - see [webrtc.md](webrtc.md). Handled by `apps/web-nuxt/server/utils/live/voice.ts`
  + `voice-rooms.ts`, dispatched in `_ws.ts`.
- `crowd:update` / `crowd:league-update` and `reaction:update` /
  `reaction:league-update` - global vs members-only totals, distinct types so a
  global handler never folds league counts in.
- `match:update` and `scores:changed` (a score moved: refetch derived views such
  as provisional standings). Three views patch
  `match:update` frames: the match detail (`useLiveMatch`), the fixtures list
  (`useLiveMatches`, into the `['matches', slug]` cache) and the knockout bracket
  (`useLiveBracket`). The bracket's scores live in a cached provider base (10-min
  TTL, `apps/web-nuxt/server/utils/bracket/cache.ts`), so it overlays the WS frame on top
  (freshest) and refetches `['bracket']` on `scores:changed` for advancement and
  live group-qualifier projections; a knockout match finishing busts that cache
  from `scores:poll` so the next slot fills without waiting out the TTL.
- The match detail header must agree with the goal event list beneath it. Both
  come from provider feeds on different clocks: the goal count off the
  detail/insights feed (~45 s, VAR-aware, the same source the list renders) and
  the WS `match:update` value patched from `scores:poll` (cron every 30 s through
  the competition's own provider, `providerForCompetition`). A
  plain max of the two can never drop when VAR disallows a goal (the stale-high WS
  side pins it), and recency arbitration can't tell a stale WS poll from a fresh
  goal - so `apps/web-nuxt/app/utils/live-score.ts` (`liveHeaderScore`) makes the fresher goal
  feed authoritative once it has landed, falling back to the WS/stored score only
  before it arrives. A struck-off goal then drops from the header and the list in
  lockstep. Wired in `apps/web-nuxt/app/pages/[competition]/matches/[id].vue` (`homeScore`).

## Client side

### `useReconnectingSocket`

The single managed connection. Exponential backoff 1s -> 30s (capped). On
`visibilitychange` (tab refocus) and the `online` event it runs `checkAlive`: a
non-open socket force-reconnects immediately; an OPEN one only gets a heartbeat
`probe()` (an out-of-band ping whose unanswered pong forces the reconnect within
the pong timeout). It must NOT tear down a healthy socket: the server treats any
socket close as leaving the voice call (a DM call ends for both sides), so the
old unconditional refocus reconnect hung up live calls on every tab switch. Its
`onOpen` fires on connect AND on every reconnect, which is the hook to
re-subscribe and refetch so the cache heals after a drop.

**Heartbeat / half-open detection** (`apps/web-nuxt/app/utils/heartbeat.ts`): a `visibilitychange`
/ `online` reconnect only fires when the socket is observably down or fails the
probe. On mobile/CGNAT a
carrier silently drops an idle NAT mapping - the socket stops delivering but never
fires `onclose`, so nothing retriggers and live data freezes until a manual reload.
The heartbeat pings every 25s (under a typical carrier idle timeout, which also
keeps the mapping warm) and if the `pong` does not arrive within 10s it declares the
socket dead and force-reconnects. `createHeartbeat` is a pure timer controller
(unit-tested); the composable wires `ping`/`onPong`/`onDead` to the socket.

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

- `apps/web-nuxt/server/routes/_ws.ts`
- `apps/web-nuxt/server/utils/live/hub.ts` (subscriber registry, presence map, every `publish*` helper), `apps/web-nuxt/server/utils/live/viewers.ts`
- `apps/web-nuxt/server/utils/live/league-chat.ts` (`publishMemberNameChanged`), `apps/web-nuxt/server/utils/live/dm-chat.ts`, `apps/web-nuxt/server/utils/live/league-reactions.ts` (`publishLeagueReactionUpdates`), `apps/web-nuxt/server/utils/live/league-crowd.ts`
- `apps/web-nuxt/server/utils/live/voice.ts`, `apps/web-nuxt/server/utils/live/voice-rooms.ts`
- `apps/web-nuxt/app/composables/useReconnectingSocket.ts`, `apps/web-nuxt/app/utils/heartbeat.ts`, `apps/web-nuxt/app/composables/usePresence.ts`, `apps/web-nuxt/app/composables/useMatchPresence.ts`
- `apps/web-nuxt/app/components/UserAvatar.vue` (presence dot), `apps/web-nuxt/app/components/MatchViewers.vue` ("N watching now")
