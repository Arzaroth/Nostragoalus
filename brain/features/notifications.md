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
  the key is not null.

The seven `notification_type` values:

`LEAGUE_JOIN`, `LEAGUE_ROLE`, `LEAGUE_REMOVED`, `PICK_REMINDER`, `MATCH_RESULT`,
`CHAMPION_RESULT`, `BEST_SCORER_RESULT`.

(The transient push-only `MATCH_LIVE` and `GOAL` kinds are NOT in this enum or
the bell - see [web push](web-push.md).)

## Live delivery

`publishUserNotification(userId, dto)` in `server/utils/live/hub.ts` sends the WS
event `notification:new` to that user's own sockets only (the same per-user gate
the league hub uses). The client `useNotifications` composable prepends the item,
bumps the badge, and refetches on reconnect. See
[../architecture/realtime.md](../architecture/realtime.md).

## API + UI

- `GET /api/notifications` - the feed plus `unreadCount`, paged with a `before`
  cursor.
- `POST /api/notifications/read` - `{ids}` or `{all}`.
- `POST /api/notifications/delete` - per-item dismiss `{ids}` (and a server-only
  `{all}` clear).
- `NotificationBell.vue` renders the popover and deep-links per type.

Emit helpers live in `server/utils/notifications/events.ts` (unit-tested
directly). Strings are i18n'd in all four locales.

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
- League activity - `LEAGUE_JOIN` (to owner + mods), `LEAGUE_ROLE`
  (promote/transfer, to the member), `LEAGUE_REMOVED` (kick, to the member). See
  [leagues](leagues.md).

## Retention

A daily `notifications:prune` task drops READ notifications older than 7 days and
caps each user to the newest 200.

## Sources

- `db/app-schema.ts` (`user_notification`, `notification_type`)
- `server/utils/notifications/service.ts`, `events.ts`, `reminders.ts`
- `server/utils/live/hub.ts` (`publishUserNotification`)
- `server/api/notifications/*`, `app/components/NotificationBell.vue`,
  `app/composables/useNotifications.ts`
