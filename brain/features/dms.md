# Direct messages (DMs)

One-to-one, end-to-end encrypted private messages between two users, global (not
league-scoped). Built on the [chat](chat.md) crypto and the same `chat_message`
row: the server stores ciphertext + sealed keys only, never plaintext. A DM is a
chat message scoped to a two-person thread instead of a league room, so it
inherits the reply/reaction/attachment/report machinery for free.

DMs and league chat share **one messaging surface**: the [ChatDock](chat.md)
gained a League | Direct mode toggle, and an open DM conversation is rendered by
the **same `ChatPanel`** that renders league chat. So a DM has full chat parity -
reactions, reply, threads, edit, images, the media gallery and link previews - not
a lean text-only cut. The only league-specific chrome a DM drops is what has no
meaning in a 1:1: enable/disable, group-key rotation, moderation, reports and
@mentions (no moderator, no roster to mention). **Safety-number verification and
identity-recovery setup DO stay** - they concern the shared E2EE identity, not the
room, so the DM overflow menu keeps them; only the league/admin items are hidden.

## Encryption model

Same group-key primitives as league chat, reused verbatim from
`app/utils/e2ee.ts` (`generateGroupKey`, `sealGroupKey`, `openGroupKey`,
`encryptMessage`, `decryptMessage`) via the [`chat_identity`](chat.md) X25519
keypair every chatting user already has.

- `dm_thread` - one row per unordered participant pair, stored as an **ordered**
  pair `(userAId < userBId)` with a `dm_thread_order` CHECK and a
  `dm_thread_pair_uq` unique index, so there is exactly one thread per `{a, b}`
  and no self-DM. The CHECK compares `COLLATE "C"` (byte order) so it agrees with
  `orderPair`'s JavaScript `a < b` regardless of the database's locale collation -
  otherwise a JS-ordered insert could fail the CHECK for some mixed-case id pairs.
  `keyEpoch` is reserved for a future re-key (always 1 today - a DM has no rotation
  path) and `lastMessageAt` orders the inbox without scanning messages.
- `dm_thread_key` - the per-thread symmetric key sealed (libsodium sealed box) to
  one participant's public key, one row per `(thread, user, epoch)` - the
  [`league_chat_key`](chat.md) model narrowed to a two-member room. Each
  participant unwraps their `wrappedKey` with their `chat_identity` private key to
  read/write. On thread creation the caller seals the fresh group key to **both**
  pubkeys (`createThread` takes both wrapped copies), so the recipient can decrypt
  the moment they open it.
- `dm_thread_read` - the per-user last-read marker, mirroring `chat_room_read`.

Clients hold an epoch->key map (`getThreadDetail` returns **all** epochs), so old
history stays readable after a rotation.

## The generalized chat_message scope

`chat_message` was generalized rather than cloned into a parallel `dm_message`
table. `league_id` is now **nullable**, a `dm_thread_id` column was added, and a
`chat_message_scope_xor` CHECK enforces `num_nonnulls(league_id, dm_thread_id) =
1` - every message is scoped to exactly one of a league room or a DM thread. A DM
message is a `chat_message` row with `dm_thread_id` set and `league_id`/`match_id`
null, secretbox-encrypted under the thread key (packed nonce+ciphertext, same
wire shape as a league message). Because reactions, attachments, reports, replies
and edits all FK `chat_message.id`, they apply to DM rows unchanged - the stack is
shared, only the scope column differs.

## Recipient discovery + privacy

`searchRecipients` (`server/utils/dm/service.ts`) returns two sets, self always
excluded:

- **Co-members** - anyone sharing at least one [league](leagues.md) with the
  caller, always messageable (returned with `shared: true` so the UI can label
  them). An empty query returns co-members only.
- **Globally discoverable strangers** - users with `dmDiscoverable = true` (a
  better-auth additionalField on the user, default true, per-user opt-out in
  preferences) who also have a `chat_identity`, matched by name. Only surfaced
  with a non-empty search term (`shared: false`).

So you can always reach people you already share a league with, and opt in (or
out) of being found by anyone else (the `dmDiscoverable` toggle lives in
preferences, next to the private-profile switch). A stranger with no
`chat_identity` is not listed - there would be no pubkey to seal the thread key to.

The same reachability is **enforced at the point of contact**, not just in search:
`canDm(caller, target)` (`server/utils/dm/service.ts`) is true when they share a
league or the target is discoverable, and it gates `createThread`, the
`GET /api/dm/identity` pubkey lookup (404, not 403, so a bare id never confirms an
account exists) and the profile page's `canMessage` flag. So a user you cannot
find also cannot be cold-messaged by someone who just knows their id; an already
open thread always reopens regardless (the gate is for first contact only).

## Live delivery

DM frames are delivered over the same in-process WebSocket [hub](../architecture/realtime.md)
but **without a subscribe frame**: `publishDmMessage` / `publishDmEdit`
(`server/utils/live/hub.ts`) fan out to the two participants by their pinned
socket `userId` (`deliverToMembers`), the same user-pinned delivery the
[notification](notifications.md) push uses. Frame types are `dm:new` and
`dm:edit`. `dm:new` carries the **full `ChatMessageDTO`** (identical to the POST
response) under a frame-level `threadId` that is the conversation id: the frame
`threadId` routes the message to the right open thread, while the message's own
`threadId` stays the reply-root (null at top level) so the recipient decrypts it
exactly like a loaded row, attachments and all. `dm:edit` carries the thread id,
message id, new ciphertext, editedAt and attachment set. No per-thread room
registry exists - a DM reaches exactly the sender and the recipient wherever they
are connected.

## Notifications + push

`notifyDm` (`server/utils/dm/notify.ts`) fires a `DM_MESSAGE`
[notification](notifications.md) (header bell) and, on top of it, a
[web push](web-push.md) - `createNotification` does both, gated on the recipient's
`dm` push category. The push copy carries the sender name only (never the E2EE
body) and deep-links via `dmPath` (`/?dm=<threadId>`). The `dm` push category
(`server/utils/push/prefs.ts`) is **default-on** and backed by the `pushDm` user
column; `content.ts` renders the copy and tags it `dm:<threadId>` so repeat DMs
from the same thread collapse.

## The UI: Direct mode inside ChatDock

There is no standalone DM dock. `app/components/DmDock.vue` and
`app/composables/useDms.ts` were **deleted**; DMs live inside
`app/components/ChatDock.vue`, the single bottom-right messaging bubble.

- **Availability.** The dock is now `v-if="signedIn"`, not league-gated - any
  signed-in user gets it, even on a page with no league selected. The bubble's
  aria-label is still `chat.dock.open` ("Open league chat"); its unread badge sums
  league activity **and** DM unread (`bubbleTotal`).
- **Mode toggle.** The header carries a two-button League | Direct toggle (a
  `pi-users` glyph and a `pi-send` paper-plane), shown only when a league chat is
  in reach. Off a league (`leagueId` null) the dock forces `mode = 'direct'` and
  hides the toggle, so DMs work where league chat cannot.
- **Direct mode views.** Three inner views (`dmView`): an **inbox** (thread list
  with unread counts and the other participant's name/avatar), a **new-message**
  view opened by the header pencil (a recipient search - suggestions shown on
  open, an empty query returns co-members), and an **open thread** rendered by
  `<ChatPanel :dm-thread-id="...">` (full chat parity). Picking a recipient calls
  `startThread` then opens the thread.
- **Deep link.** `/?dm=<threadId>` (from a bell/push) opens the dock straight into
  Direct mode on that conversation (`onMounted` reads `route.query.dm`).

Three composables back it:

- **`app/composables/useDmRoom.ts`** - the per-thread engine, a drop-in for
  `useLeagueChat`'s interface (same surface: `messages`, `send`, `react`,
  `editMessage`, reply/thread, images...), pointed at `/api/dm/${threadId}/*` and
  unwrapping the per-thread key instead of a league group key. This is what lets
  the shared `ChatPanel` drive a DM unchanged; league-only ops
  (enable/disable/rotate/rekey/roster/moderation/typing) are inert.
- **`app/composables/useDmInbox.ts`** - the list side: the threads query,
  `ensureIdentity`, `searchRecipients`, `startThread`, `markRead`, `totalUnread`.
  It reuses `app/utils/e2ee.ts` to seal a fresh key to both pubkeys on thread
  creation and opens the DM socket, patching the inbox on `dm:new`/`dm:edit`.
- **`app/composables/useDmOpen.ts`** - a one-slot app-level signal so a "Message"
  button elsewhere (e.g. a user profile page) asks the dock to switch to Direct
  and open/start a thread with a given user.

## Sources

- `db/app-schema.ts` (`dm_thread`, `dm_thread_key`, `dm_thread_read`,
  `chat_message` generalization + `chat_message_scope_xor`, `DM_MESSAGE`
  notification type)
- `lib/auth.ts` (`pushDm`, `dmDiscoverable` user additionalFields)
- `server/utils/dm/service.ts` (`createThread`, `listThreads`, `getThreadDetail`,
  `postDmMessage`, `editDmMessage`, `listDmMessages`, `markThreadRead`,
  `searchRecipients`, `canDm`), `server/utils/dm/notify.ts` (`notifyDm`)
- `server/utils/chat/access.ts` - the scope-agnostic authorizer: a caller may act
  on a `chat_message` if they are a member of its league room **or** a participant
  of its DM thread, so the shared message/reaction/attachment/edit routes serve
  both scopes.
- `server/api/dm/**` (`threads`, `[threadId]/{index,messages,edit,read,react}`,
  `[threadId]/attachments/[messageId]`, `[threadId]/media`, `identity`,
  `recipients`) - `messages.get` returns enriched `ChatMessageDTO`s, `edit.post`
  carries image add/remove, matching the league-chat routes.
- `server/utils/live/hub.ts` (`publishDmMessage`, `publishDmEdit`),
  `server/utils/push/{prefs,content}.ts` (`dm` category)
- `shared/types/dm.ts` (`DmThreadDetailDTO`, `DmThreadSummaryDTO`,
  `DmRecipientDTO`, `dmPath` - the live frame reuses `ChatMessageDTO`, no separate
  DM message shape), `app/composables/{useDmRoom,useDmInbox,useDmOpen}.ts`,
  `app/components/{ChatDock,ChatPanel}.vue`, `app/pages/preferences.vue`
  (`dmDiscoverable`, `pushDm` toggles), `app/utils/e2ee.ts`
