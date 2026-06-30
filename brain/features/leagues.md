# Leagues

Leagues are competition-scoped player groups. They filter the views (leaderboard,
crowd totals, chat) to a subset of players. They deliberately do **not** scope
predictions: a user has one set of predictions per competition, shared across
every league they are in. Leagues are a lens, not a separate game.

## Selection: a cookie, not the URL

Unlike [competitions](competitions.md), the active league is not in the URL. It
is the `ng-league` cookie, a single map of `competitionSlug -> leagueId`. The
cookie ref is exposed as a per-Nuxt-app singleton (`useLeagueSelections`) because
`useCookie` otherwise returns independent refs per call site.

## Membership model

- A membership is a `league_member` row keyed by `(leagueId, userId)` with a
  `role` of `OWNER`, `MODERATOR`, or `MEMBER`. The row existing means "member";
  there is no status column.
- `league_opt_out` is a separate "never auto-re-add" memory. Leaving, being
  kicked, or being admin-removed writes an opt-out row; rejoining or being
  admin-added clears it. This stops SSO auto-join from re-adding someone who left.
- Ownership: the first joiner of an ownerless league becomes `OWNER` (including
  via SSO auto-join). An ownerless league is legal (admins can create one). The
  last member leaving keeps the league alive (code stays valid, next joiner
  owns it); an admin "Prune empty leagues" action deletes memberless leagues.
  An owner cannot leave while other members remain (transfer or delete first); a
  sole owner leaving deletes the league.

## Visibility

The `league_visibility` enum has two values:

- `PUBLIC` - anyone can one-click join and view rankings at `/leagues/[id]`.
- `PRIVATE` - 404s to outsiders, so the id's existence is never leaked. Joining
  needs the join code.

Join codes are 4 - 16 characters, case/dash/space-insensitive, unique
(collision-retried), and the join-code endpoint is rate-limited by an in-process
sliding window (`server/utils/rate-limit.ts`).

## Access guards

Two shared helpers in `server/utils/leagues/service.ts` enforce access uniformly
so no endpoint hand-rolls the membership/role lookup: `resolveLeagueView` for
scoped reads (the PUBLIC view path, or members-only when `membersOnly`, with a
site-admin override) and `resolveLeagueManage` for mutations (role-gated). Both
return the SAME "not found" for a missing league and for an outsider on a private
one, so neither a read nor a management action leaks a private league's existence
(an outsider cannot tell "does not exist" from "you are not in it"). A member with
too low a role gets a distinct "forbidden" - they already know it exists.

## SSO auto-join

Members of an identity provider can be auto-added to a league. This runs in the
`provisionUser` callback on every login (`provisionUserOnEveryLogin: true`),
linked by stable `providerId` through `sso_provider_league`. See
[../architecture/auth.md](../architecture/auth.md). Auto-join respects
`league_opt_out`.

## League leaderboard

The league board uses the same ranking ladder as the global board, inner-joined
on members. Movement arrows come from `league_leaderboard_rank` snapshots written
by the finalize task. Private profiles are included only when the viewer is a
member or admin (`includePrivate` option); an outsider viewing a public league
gets null ranks for hidden players so their board does not leak private rank.

Two distinct hiding mechanisms:

- `user.profile_private` is a user-settable opt-out of ranking. It removes the
  user from the global and competition boards for everyone (even admins, since it
  is a ranking opt-out, not moderation), and gates the profile page to
  self/admins/league-mates via `canViewProfile` (404, no existence leak).
- `hiddenFromLeaderboard` is admin-only moderation that hides a user everywhere.

## Chat

Each league hosts an end-to-end-encrypted chat. The league row carries
`chat_enabled_by` and `chat_key_epoch`. The full design is in [chat.md](chat.md).

## Related

- The consensus ghost can be scoped to league members for display:
  [crowd-bot.md](crowd-bot.md).

## Sources

- `db/app-schema.ts` (`league`, `league_member`, `league_opt_out`,
  `league_invite`, `league_leaderboard_rank`, `league_visibility`/`league_role` enums)
- `server/utils/leagues/service.ts`
- `server/api/leagues/**` (`join.post.ts`, `leave.post.ts`, `[id]/**`)
- `app/utils/league-cookie.ts`, `app/composables/useLeagues.ts` (`useLeagueSelections`)
- `server/utils/rate-limit.ts`
