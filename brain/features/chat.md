# Chat

End-to-end encrypted league chat. The server stores ciphertext only, so almost
every feature is implemented client-side after decryption. The server moderates
and routes by message id and metadata, never by reading content.

## Encryption model

- `chat_identity` - one row per user holding their public key.
- `league_chat_key` - the per-league symmetric key, sealed to each member, with
  an `epoch` for rotation. A key handshake reconciles members when the epoch
  changes; messages carry the `epoch` they were encrypted under so stale edits
  are rejected.
- `chat_message` - `ciphertext`, `epoch`, `parentId` (an inline QUOTE),
  `threadId` (a thread relation), `editedAt`.
- `chat_attachment` - composite key `(messageId, idx)`. Either `ciphertext` or
  `storage_key` is set (a CHECK enforces exactly one), so the encrypted blob can
  live in Postgres or in the [object store](image-storage.md). Up to 6 images per
  message; the 5MB original is compressed to webp before encryption (GIFs pass
  through to preserve animation).

## Messaging features

- Length limit 2000 (`MAX_MESSAGE_TEXT_LENGTH`), with a 16KB ciphertext server
  backstop.
- Own messages are right-aligned (bubble, images, reactions, mirrored header).
- Quotes (`parentId`) render the decrypted parent inline; threads (`threadId`)
  are a separate relation shown oldest-first with their own scoped composer, and
  `getThreadCounts` feeds the per-message thread count.
- `@mentions` - the composer holds `@DisplayName`; on send it is encoded to an
  `@<id>` token, and the mentioned ids ride as a plaintext `mentions[]` sidecar
  (the body stays E2EE, so the ids are never decrypted server-side and are not
  stored on the message). They drive the live unread-mention badge (the `chat:new`
  frame) and, via `server/utils/chat/mentions.ts` `notifyMentions` at post time, a
  durable `CHAT_MENTION` [notification](notifications.md) (header bell) plus a
  [web push](web-push.md) - regardless of which league or match. The ids are
  intersected with the league's real members and the sender is dropped, which
  stops cross-league and self spam; it cannot stop a co-member fabricating a
  mention the visible text never named (the body is E2EE, so the server can't
  check the sidecar), and the recipient's own `pushMentions` toggle is the
  backstop there (see TODO). The push/bell deep-links cross-league via
  `chatMentionPath` (`?ngLeague=&chat=`), interpreted by the `chat-deeplink`
  client plugin.
- Reactions reuse the [match reaction set](reactions.md) (plaintext emoji, so the
  server sees the emoji but not the message).
- A hand-rolled emoji picker inserts raw unicode at the caret.
- Rich rendering: `app/utils/chat-content.ts` tokenizes the decrypted text and
  `ChatMessageContent.vue` renders `@mentions`, inline image/gif URLs, and the
  first link as a collapsible `ChatLinkPreview`.

## Link previews (unfurl)

`GET /api/chat/unfurl` + `server/utils/chat/unfurl.ts` fetch and parse OpenGraph
metadata. It is auth-gated and SSRF-guarded: per-hop DNS resolution with
private / loopback / link-local blocking, manual redirect handling, a byte cap,
html-only, and an in-memory cache. It fetches through the shared cycletls
Chrome-JA3 engine so Cloudflare-class WAFs (for example 9gag) do not 403 the
request. See [../architecture/providers.md](../architecture/providers.md). A
known residual is the DNS-rebind TOCTOU window (documented in TODO).

## Moderation

- `moderation_state` enum: `VISIBLE`, `PENDING`, `REMOVED`. A message auto-flips
  to `PENDING` at `ceil(25% of league members)` reports with a minimum of 3
  distinct reporters; it shows as "pending" to others until an owner or moderator
  resolves it.
- `REMOVED` is a tombstone ("message removed") so quote and thread chains stay
  intact; the ciphertext is stripped server-side for hidden messages.
- `chat_message_report` is the report queue for owners/mods (report / unreport).
- Mute / unmute hides a user's messages for the muting viewer.

## Surfaces + live

The floating, collapsible `ChatDock` (Global / Match scope) coexists with the
inline `ChatPanel` on the league page. Its header carries a league switcher
(change league without the competition pill), shown as just the league glyph plus
a chevron (the name would crowd the scope toggle in the narrow dock; it rides a
tooltip, and the dropdown lists full names). The dropdown lists only the user's
leagues that have chat **enabled** (`chatEnabled` on the my-leagues DTO), and each
shows a dot when it has any unread chat, whether in its global room or a match
thread (`useChatActivity.hasUnreadInLeague`). Enabling/disabling a league's chat
invalidates the my-leagues query so the switcher updates without a reload. Presence
dots and client-side search are built in. Live events on the WebSocket: `chat:new`, `chat:moderation`,
`chat:roster` (display-name changes), and `chat:state-changed` (chat on/off and
key rotation). See [../architecture/realtime.md](../architecture/realtime.md).

## Unread inbox (cross-league)

The dock's ROOMS WITH ACTIVITY popover lists every room - global room or match
thread - with unread messages and/or unread mentions across ALL the user's
leagues, not just the selected one, and it survives a reload.

- Read state is a per-room marker, `chat_room_read (userId, leagueId, roomKey)`
  with `lastReadAt` - deliberately NOT a per-message "seen by" receipt. `roomKey`
  is the matchId, or the `__global__` sentinel (`shared/types/chat.ts` `roomKeyFor`).
- `GET /api/chat/unread` (`server/utils/chat/unread.ts` `getUnreadRooms`) counts,
  per room across the user's leagues, messages newer than the marker - floored at
  `league_member.joinedAt` when there is no marker, so pre-join history never
  shows - excluding own, thread-reply and non-visible messages. Unread-mention
  counts are read off the unread `CHAT_MENTION` bell rows (the durable mention
  store), so they survive reload too.
- `POST /api/chat/read` (`markRoomRead`) upserts the marker to the server clock
  and clears that room's unread mention rows, so opening a room clears both
  counters at once (reload parity with the live tracker). The client only sends
  it once the room is actually READABLE - the panel is loaded AND holds the group
  key (`ChatPanel` emits `update:readable`, the dock gates its receipt on it). So
  switching into a league this device cannot decrypt yet (no recovery key, or the
  key was never sealed to you) does NOT mark it read; it stays unread and clears
  on the readable flip once the messages decrypt. The dock drops that readable
  flag the instant the active league/room changes (the panel stays mounted and
  re-emits a tick later), so a switch never marks the new, not-yet-decrypted room
  read off the previous room's readiness.
- A room open draws a **last-read divider**. `GET /api/chat/messages` returns the
  caller's `readMarker` for the room (`getRoomReadMarker` in `unread.ts`);
  `useLeagueChat` freezes it on a foreground open - captured before the receipt
  above advances it - and `ChatPanel` renders a "new messages" line before the
  first message newer than the marker that is not the reader's own. Frozen, so it
  holds position while you catch up and is gone on the next open.
- `useChatActivity` is backed by the unread query (keyed per `leagueId::roomKey`),
  patched optimistically from the live `chat:new` socket between fetches, then
  re-sorted client-side (newest first, `leagueId+roomKey` tiebreaker) so the patches
  never leave it out of order. Opening a foreign-league room points the `ng-league`
  cookie at its competition and navigates there (`ChatDock.openRoom`); the mention
  deep link reaches a room the same way via `useChatDockOpen` + the `chat-deeplink`
  plugin.
- The inbox's mention counts and the [bell](notifications.md)'s unread count read
  the same `CHAT_MENTION` rows, so the two mutate each other's state: marking a room
  read clears its mention rows (bell drops) and reading/clearing in the bell clears
  mention rows (inbox badges drop). `useChatActivity` and `useNotifications`
  cross-invalidate each other's query on those writes so neither view goes stale.

## History

The bulk of these features shipped in 1.36.0 (dock, reactions, reply/quote,
images, moderation) and 1.42.0 (threads, mentions, emoji picker, link previews,
presence dots); 1.42.1 reverted an unfurl IP-pin that broke previews for the
Cloudflare sites the feature targets.

When a [My Little Prono skin](easter-eggs.md) is active, chat reactions inherit
the pony-head glyph swap from the match reaction stack.

## Sources

- `db/app-schema.ts` (`chat_message`, `chat_attachment`, `chat_identity`,
  `league_chat_key`, `chat_message_report`, `chat_moderation_state`,
  `chat_room_read`)
- `server/utils/chat/*` (service, unfurl, `mentions`, `unread`),
  `server/api/chat/{unread.get,read.post}.ts`, `shared/types/chat.ts`,
  `shared/reactions.ts`
- `app/utils/chat-content.ts`, `app/components/Chat*.vue`,
  `app/composables/useLeagueChat.ts`, `useChatActivity.ts`, `useChatDockOpen.ts`,
  `app/plugins/chat-deeplink.client.ts`
