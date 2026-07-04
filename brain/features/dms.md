# Direct messages (DMs)

One-to-one, end-to-end encrypted private messages between two users, global (not
league-scoped). Built on the [chat](chat.md) crypto and the same `chat_message`
row: the server stores ciphertext + sealed keys only, never plaintext. A DM is a
chat message scoped to a two-person thread instead of a league room, so it
inherits the reply/reaction/attachment/report machinery for free (only text +
edit are wired in v1 - see [TODO](../../TODO.md)).

## Encryption model

Same group-key primitives as league chat, reused verbatim from
`app/utils/e2ee.ts` (`generateGroupKey`, `sealGroupKey`, `openGroupKey`,
`encryptMessage`, `decryptMessage`) via the [`chat_identity`](chat.md) X25519
keypair every chatting user already has.

- `dm_thread` - one row per unordered participant pair, stored as an **ordered**
  pair `(userAId < userBId)` with a `dm_thread_order` CHECK and a
  `dm_thread_pair_uq` unique index, so there is exactly one thread per `{a, b}`
  and no self-DM. Carries `keyEpoch` (rotation counter) and `lastMessageAt` (so
  the inbox orders without scanning messages).
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
out) of being found by anyone else. A stranger with no `chat_identity` is not
listed - there would be no pubkey to seal the thread key to.

## Live delivery

DM frames are delivered over the same in-process WebSocket [hub](../architecture/realtime.md)
but **without a subscribe frame**: `publishDmMessage` / `publishDmEdit`
(`server/utils/live/hub.ts`) fan out to the two participants by their pinned
socket `userId` (`deliverToMembers`), the same user-pinned delivery the
[notification](notifications.md) push uses. Frame types are `dm:new` (carrying the
`DmMessageDTO`) and `dm:edit` (thread id, message id, new ciphertext, editedAt).
No per-thread room registry exists - a DM reaches exactly the sender and the
recipient wherever they are connected.

## Notifications + push

`notifyDm` (`server/utils/dm/notify.ts`) fires a `DM_MESSAGE`
[notification](notifications.md) (header bell) and, on top of it, a
[web push](web-push.md) - `createNotification` does both, gated on the recipient's
`dm` push category. The push copy carries the sender name only (never the E2EE
body) and deep-links via `dmPath` (`/?dm=<threadId>`). The `dm` push category
(`server/utils/push/prefs.ts`) is **default-on** and backed by the `pushDm` user
column; `content.ts` renders the copy and tags it `dm:<threadId>` so repeat DMs
from the same thread collapse.

## The DmDock UI

`app/components/DmDock.vue` is a global, floating bottom-left dock, mounted once in
`app/layouts/default.vue` (so it is present on every page, unlike the
league-gated [ChatDock](chat.md)). It has three views: an inbox
(`listThreads` summaries with unread counts), an open thread (decrypted messages +
composer + edit), and a new-recipient search. `app/composables/useDms.ts` drives
it: it reuses `app/utils/e2ee.ts` to seal a fresh key to both pubkeys on thread
creation, unwrap the per-epoch keys, and encrypt/decrypt messages client-side;
it opens the DM socket and patches the inbox on `dm:new`/`dm:edit`. A DM
notification deep-links to `/?dm=<threadId>`, which opens the dock on that thread.

## Why a separate dock

The design intent was a tab inside the existing [ChatDock](chat.md), but ChatDock
is league-gated (it only shows on `/[competition]/` pages with a chat-enabled
league selected), while DMs are global and must work everywhere. So DMs ship as a
separate global `DmDock`. Consolidating the two docks is a possible future step -
see [decisions.md](../decisions.md) and [TODO](../../TODO.md).

## Sources

- `db/app-schema.ts` (`dm_thread`, `dm_thread_key`, `dm_thread_read`,
  `chat_message` generalization + `chat_message_scope_xor`, `DM_MESSAGE`
  notification type)
- `lib/auth.ts` (`pushDm`, `dmDiscoverable` user additionalFields)
- `server/utils/dm/service.ts` (`createThread`, `listThreads`, `getThreadDetail`,
  `postDmMessage`, `editDmMessage`, `listDmMessages`, `markThreadRead`,
  `searchRecipients`), `server/utils/dm/notify.ts` (`notifyDm`)
- `server/api/dm/**` (`threads`, `[threadId]/{index,messages,edit,read}`,
  `identity`, `recipients`)
- `server/utils/live/hub.ts` (`publishDmMessage`, `publishDmEdit`),
  `server/utils/push/{prefs,content}.ts` (`dm` category)
- `shared/types/dm.ts` (`DmMessageDTO`, `dmPath`), `app/composables/useDms.ts`,
  `app/components/DmDock.vue`, `app/utils/e2ee.ts`
