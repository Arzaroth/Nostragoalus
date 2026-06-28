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
  `@<id>` token, and the mentioned ids are relayed as plaintext `mentions[]` on
  the `chat:new` push (never stored). `useChatActivity` badges unread mentions
  distinctly.
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
inline `ChatPanel` on the league page. Presence dots and client-side search are
built in. Live events on the WebSocket: `chat:new`, `chat:moderation`,
`chat:roster` (display-name changes), and `chat:state-changed` (chat on/off and
key rotation). See [../architecture/realtime.md](../architecture/realtime.md).

## History

The bulk of these features shipped in 1.36.0 (dock, reactions, reply/quote,
images, moderation) and 1.42.0 (threads, mentions, emoji picker, link previews,
presence dots); 1.42.1 reverted an unfurl IP-pin that broke previews for the
Cloudflare sites the feature targets.

When a [My Little Prono skin](easter-eggs.md) is active, chat reactions inherit
the pony-head glyph swap from the match reaction stack.

## Sources

- `db/app-schema.ts` (`chat_message`, `chat_attachment`, `chat_identity`,
  `league_chat_key`, `chat_message_report`, `chat_moderation_state`)
- `server/utils/chat/*` (service, unfurl), `shared/types/chat.ts`,
  `shared/reactions.ts`
- `app/utils/chat-content.ts`, `app/components/Chat*.vue`,
  `app/composables/useLeagueChat.ts`, `useChatActivity.ts`
