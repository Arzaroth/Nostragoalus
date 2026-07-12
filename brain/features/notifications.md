# Notifications

The in-app notification center: a header bell with an unread badge and a popover
feed. It is the substrate that [web push](web-push.md) sits on top of.

## Data model

One table, `user_notification`:

- `type` (enum) mirrors `data.type`. The service derives the column from the
  typed `data` jsonb bag, so there are no per-type columns - the discriminated
  union lives in the payload.
- `data` (jsonb) - the typed payload (deep-links, scorelines, league names, ...).
- `readAt` - null means unread.
- `dedupeKey` - nullable, with a per-user partial unique index. Scheduled and
  finalize triggers pass a stable key so re-runs stay idempotent;
  `createNotification` does `onConflictDoNothing` on `(userId, dedupeKey)` when
  the key is not null. Passing `refresh: true` flips the collision from no-op to
  resurface (`onConflictDoUpdate`): the existing row is bumped to now and marked
  unread with the new data, so a grouping key collapses a burst into one
  freshly-unread entry (used by `DM_MESSAGE`, one row per thread).

The eleven `notification_type` values:

`LEAGUE_JOIN`, `LEAGUE_ROLE`, `LEAGUE_REMOVED`, `PICK_REMINDER`, `MATCH_RESULT`,
`CHAMPION_RESULT`, `BEST_SCORER_RESULT`, `TROPHY_AWARDED`,
`ACHIEVEMENT_UNLOCKED`, `CHAT_MENTION`, `DM_MESSAGE`.

(The transient push-only `MATCH_LIVE` and `GOAL` kinds are NOT in this enum or
the bell - see [web push](web-push.md).)

## Live delivery

`publishUserNotification(userId, dto)` in `apps/web-nuxt/server/utils/live/hub.ts` sends the WS
event `notification:new` to that user's own sockets only (the same per-user gate
the league hub uses). The client `useNotifications` composable prepends the item,
bumps the badge, and refetches on reconnect. See
[../architecture/realtime.md](../architecture/realtime.md).

## API + UI

- `GET /api/notifications` - the feed plus `unreadCount`, paged with a compound
  `(before, beforeId)` keyset cursor (the `id` tiebreaks rows that share a
  `createdAt`, since a whole finalize tick is minted at the transaction-start
  time - see `keysetBefore` in `apps/web-nuxt/server/utils/keyset.ts`, shared with chat).
- `POST /api/notifications/read` - `{ids}` or `{all}`.
- `POST /api/notifications/delete` - per-item dismiss `{ids}` (and a server-only
  `{all}` clear).
- `NotificationBell.vue` renders the popover and deep-links per type.

Emit helpers live in `apps/web-nuxt/server/utils/notifications/events.ts` (unit-tested
directly). Strings are i18n'd in all five locales.

## Triggers

- `PICK_REMINDER` is the only TIME-based one. The `notifications:send-reminders`
  task (registry cron `*/15`) reminds active predictors (users with at least one
  prediction in the competition) of a match locking within `REMINDER_LEAD_MS`
  (3h) that they have not picked. Dedupe key `pick-reminder:{matchId}`. The
  reminder is pruned once the match kicks off (the window closed) and cleared
  immediately when the user picks (`deletePickReminder` from `upsertPrediction`).
- `MATCH_RESULT` - per finalized match you predicted (scoreline + points,
  including 0), emitted from the finalize scoring transaction. Dedupe
  `match-result:{matchId}`.
- `CHAMPION_RESULT` / `BEST_SCORER_RESULT` - to winners at finalize, deduped per
  competition. See [champion pick](champion-pick.md) and [best
  scorer](best-scorer.md).
- `TROPHY_AWARDED` / `ACHIEVEMENT_UNLOCKED` - competition-end trophies and
  milestone badges, emitted from the finalize scoring transaction (a badge like
  the secret unlock can also fire outside finalize). Both deep-link to the
  recipient's own trophy cabinet (`#cabinet` on their competition profile, via
  `cabinetPath`), so clicking opens the cabinet. Dedupe
  `trophy:{competitionId}:{type}` and
  `achievement:{competitionId|global}:{key}:{tier}`. See
  [achievements](achievements.md).
- League activity - `LEAGUE_JOIN` (to owner + mods), `LEAGUE_ROLE`
  (promote/transfer, to the member), `LEAGUE_REMOVED` (kick, to the member). See
  [leagues](leagues.md).
- `CHAT_MENTION` - someone @mentioned the recipient in league [chat](chat.md),
  fired from the post path (`apps/web-nuxt/server/utils/chat/mentions.ts`), cross-league. Data
  carries room context only (sender name + league/match), never message text (the
  chat is E2EE). Dedupe `mention:{messageId}:{userId}`. Marking the room read
  clears these rows (see chat's cross-league inbox).
- `DM_MESSAGE` - a new [direct message](dms.md), fired from the DM post path
  (`notifyDm`). Data carries thread + sender name only (E2EE, no preview). Dedupe
  is per-thread `dm-thread:{threadId}` with `refresh: true`, so a whole
  conversation is one bell row that resurfaces unread on each message, never one
  row per message. The bell then collapses *all* `DM_MESSAGE` rows into a single
  grouped entry; clicking it opens the one thread it covers, or the DM inbox when
  it spans several - via the `useDmDockOpen` store (opens the already-mounted dock
  in place), not a route, so it never lands on the home page. Web push still deep-
  links via `dmPath` (`/?dm=<threadId>`) for a fresh app open.

## Retention

A daily `notifications:prune` task drops READ notifications older than 7 days and
caps each user to the newest 200.

## Sources

- `apps/web-nuxt/db/app-schema.ts` (`user_notification`, `notification_type`)
- `apps/web-nuxt/shared/types/notifications.ts` (`NotificationType` / `NotificationData`, `cabinetPath`)
- `apps/web-nuxt/server/utils/notifications/service.ts`, `events.ts`, `reminders.ts`
- `apps/web-nuxt/server/utils/live/hub.ts` (`publishUserNotification`)
- `apps/web-nuxt/server/api/notifications/*`, `apps/web-nuxt/app/components/NotificationBell.vue`,
  `apps/web-nuxt/app/composables/useNotifications.ts`
