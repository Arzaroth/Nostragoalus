# Web push

VAPID web-push notifications, built directly on the [notification
center](notifications.md). Two gates stack: the browser opt-in is the master
switch, and on top of it every notification kind has its own per-category push
toggle.

## Preferences model

Nine nullable `push*` boolean columns live on the better-auth `user` table
(additionalFields). Null means "use the category default", resolved in
`apps/web-nuxt/server/utils/push/prefs.ts`. Catalogue and defaults:

| Category | Push key | Default |
|---|---|---|
| Pick reminders | reminders | on |
| Match kickoff (`MATCH_LIVE`) | kickoff | on |
| Live goals (`GOAL`) | goals | on |
| Match results | matchResults | on |
| Tournament (champion / best scorer / trophies / achievements) | tournament | on |
| League activity | league | off |
| Chat mentions (`CHAT_MENTION`) | mentions | on |
| Direct messages (`DM_MESSAGE`) | dm | on |
| Missed calls (`VOICE_MISSED`) | calls | on |

`MATCH_LIVE` and `GOAL` are push-only and transient: they are NOT stored in the
bell or the [notification enum](notifications.md). `MATCH_LIVE`, `GOAL`, and
`MATCH_RESULT` only push to users who actually predicted that match.
`CHAT_MENTION` is a stored bell type (so it also pushes through
`createNotification`), fired from the [chat](chat.md) post path - cross-league,
to the mentioned members only. `DM_MESSAGE` ([DMs](dms.md)) and `VOICE_MISSED`
([voice chat](voice-chat.md)) are stored bell types too, pushed the same way.
Stored types map to a category via `categoryForType` in `prefs.ts`.

## Subscriptions + keys

`push_subscription` is endpoint-unique and upserted on re-subscribe (endpoint,
`p256dh`, `auth`, userAgent). VAPID keys come from `runtimeConfig`, read
server-side so unit tests are a no-op when unset. Production MUST generate its
own keys: `NUXT_PUBLIC_VAPID_PUBLIC_KEY`, `NUXT_VAPID_PRIVATE_KEY`,
`NUXT_VAPID_SUBJECT`.

## Service worker

The app uses `@vite-pwa/nuxt` in `injectManifest` mode with a custom worker at
`apps/web-nuxt/app/service-worker/sw.ts` (Workbox precache plus `push` and `notificationclick`
handlers). See [../architecture/rendering.md](../architecture/rendering.md) and
[pwa.md](pwa.md).

## Send path

`apps/web-nuxt/server/utils/push/send.ts` (`pushNotification` / `pushToUser`) gates on the
config plus the category toggle, delivers to all of a user's subscriptions, and
prunes dead ones (404 / 410). Stored-type pushes resolve the admin-set default
competition for their link, behind the configured gate so an unconfigured push
does no database work. Push copy is rendered server-side in
`apps/web-nuxt/server/utils/push/content.ts` with `push.*` i18n keys in all five locales (the
bell's client-side item text cannot run server-side). The send is hooked
fire-and-forget into `createNotification` and the finalize post-commit flush
(`server/utils/sync/finalize.ts`).

## Live triggers

`upsertMatches` returns `transitions`; the `scores:poll` task
(`server/tasks/scores/poll.ts`) feeds them to
`apps/web-nuxt/server/utils/push/live.ts` `notifyLiveMatchEvents`, which fires kickoff on a
`SCHEDULED -> LIVE` transition and a goal on a live score increase, predictor-
scoped. A goal alert cannot be recalled from the device, so the dedup is a
persisted per-side high-water (`match.last_goal_push_home` / `_away`), advanced
before sending: a VAR disallow that dips the score and returns to an announced
level never re-pushes.

## Client

`usePushNotifications` (subscribe / unsubscribe) talks to
`/api/push/subscribe` and `/api/push/unsubscribe`; the toggles live in the
Notifications section of `preferences.vue`. iOS only delivers web push to an
installed PWA (iOS >= 16.4).

## Sources

- `apps/web-nuxt/db/app-schema.ts` (`push_subscription`), better-auth `user` push fields (`apps/web-nuxt/db/auth-schema.ts`)
- `apps/web-nuxt/server/utils/push/{prefs,send,content,live,service}.ts`
- `apps/web-nuxt/server/api/push/{subscribe,unsubscribe}.post.ts`, `apps/web-nuxt/server/tasks/scores/poll.ts`
- `apps/web-nuxt/app/service-worker/sw.ts`, `apps/web-nuxt/app/composables/usePushNotifications.ts`,
  `apps/web-nuxt/app/pages/preferences.vue`
